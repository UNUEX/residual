from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import unittest

from src.localization import LANGUAGES, get_language, normalize_language, tr, using_language
from src.table_calculation import calculate, question_guard

class LocalizationTests(unittest.TestCase):
    def setUp(self):
        self.columns=[{'id':'c0','label':'Home Русский 中文 한국어','role':'category','unit':''},
                      {'id':'c1','label':'Value','role':'number','unit':'m²','decimal_separator':'.','missing_values':['99']}]
        self.rows=[['Home Русский 中文 한국어','2'],['Home Русский 中文 한국어','4'],['Data','99']]
        self.plan={'status':'ready','reason':'approved','metrics':['c1'],'aggregation':'mean','group_by':'c0'}

    def test_all_catalogues_are_complete(self):
        root=Path(__file__).resolve().parents[1]
        for directory in ('app/locales','src/locales'):
            dictionaries=[json.loads((root/directory/(language+'.json')).read_text(encoding='utf-8')) for language in LANGUAGES]
            for dictionary in dictionaries:
                self.assertEqual(set(dictionary),set(dictionaries[0]))
                self.assertTrue(all(isinstance(value,str) and value for value in dictionary.values()))

    def test_request_language_is_scoped_and_unsupported_language_falls_back_to_english(self):
        self.assertEqual(get_language(),'en')
        with using_language('ko-KR'):
            self.assertEqual(tr('Mean'),'평균')
            with using_language('zh-CN'):
                self.assertEqual(tr('Mean'),'平均值')
            self.assertEqual(get_language(),'ko')
        self.assertEqual(get_language(),'en')
        self.assertEqual(normalize_language('ru'),'en')
        def worker(language):
            with using_language(language):return get_language(),tr('Mean')
        with ThreadPoolExecutor(max_workers=4) as pool:
            self.assertEqual(list(pool.map(worker,LANGUAGES)),[('en','Mean'),('kk','Орташа'),('ko','평균'),('zh-CN','平均值')])

    def test_language_never_changes_values_missing_rules_groups_or_user_labels(self):
        original=json.dumps([self.rows,self.columns,self.plan],ensure_ascii=False)
        expected=calculate(self.rows,self.columns,self.plan)
        for language in LANGUAGES:
            with using_language(language):
                actual=calculate(self.rows,self.columns,self.plan)
                self.assertEqual(actual['table'],expected['table'])
                self.assertEqual(actual['quality'],expected['quality'])
                self.assertEqual(actual['formulas']['c1']['label'],'Value')
                self.assertIn('Home Русский 中文 한국어',actual['summary'][0])
        self.assertEqual(json.dumps([self.rows,self.columns,self.plan],ensure_ascii=False),original)

    def test_operations_are_understood_and_unsupported_methods_blocked_in_four_languages(self):
        questions={'en':('Find the mean of «Value» by «Home Русский 中文 한국어».','Find the weighted mean of «Value».','Forecast «Value».'),
                   'kk':('«Home Русский 中文 한국어» бойынша «Value» орташа мәнін есепте.','«Value» салмақталған орташа мәнін есепте.','«Value» көрсеткішіне болжам жаса.'),
                   'ko':('«Home Русский 中文 한국어»별 «Value»의 평균을 계산해 줘.','«Value»의 가중 평균을 계산해 줘.','«Value»를 예측해 줘.'),
                   'zh-CN':('按 «Home Русский 中文 한국어» 比较 «Value» 的平均值。','计算 «Value» 的加权平均值。','预测 «Value»。')}
        for language,(supported,weighted,forecast) in questions.items():
            with self.subTest(language=language),using_language(language):
                for question,status in [(supported,'ready'),(weighted,'unsupported'),(forecast,'unsupported')]:
                    checked=question_guard(question,self.plan,{'columns':self.columns})
                    self.assertEqual(checked['status'],status)

    def test_chinese_period_and_unspaced_column_names_are_checked(self):
        columns=[{'id':'c0','label':'地区','role':'category','unit':''},{'id':'c1','label':'收入','role':'number','unit':''}]
        dataset={'columns':columns,'period':'2024年'}
        self.assertEqual(question_guard('按地区计算收入的平均值',self.plan,dataset)['status'],'ready')
        self.assertEqual(question_guard('按地区计算2025年收入的平均值',self.plan,dataset)['status'],'unsupported')

    def test_housing_guards_validate_localized_operations_measures_and_periods(self):
        from src.research import question_guard as housing_guard, ResearchError
        plan = {'status':'ready', 'reason':'preview', 'year':2024,
                'metrics':['area_per_person'], 'aggregation':'median', 'grouping':'household_size'}
        questions = {'en':'Median area per person by household size in 2024',
                     'kk':'2024 жылы үй шаруашылығы мөлшері бойынша бір адамға шаққандағы аудан медианасы',
                     'ko':'2024년 가구 규모별 1인당 면적 중앙값',
                     'zh-CN':'2024年按住户规模比较人均面积中位数'}
        for language, question in questions.items():
            with self.subTest(language=language), using_language(language):
                self.assertEqual(housing_guard(question,plan),plan)
                self.assertEqual(housing_guard(question.replace('2024','2025'),plan)['status'],'unsupported')
                with self.assertRaises(ResearchError):
                    housing_guard(question,{**plan,'aggregation':'mean'})
                with self.assertRaises(ResearchError):
                    housing_guard(question,{**plan,'metrics':['total_area']})
                with self.assertRaises(ResearchError):
                    housing_guard(question,{**plan,'grouping':'all'})

if __name__=='__main__':
    unittest.main()
