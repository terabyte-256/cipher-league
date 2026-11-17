import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from datetime import date, timedelta

MODULE=Path(__file__).resolve().parents[1]/'scripts/sync_events.py'
spec=importlib.util.spec_from_file_location('sync_events',MODULE)
score=importlib.util.module_from_spec(spec)
spec.loader.exec_module(score)

class ScoringTests(unittest.TestCase):
    def test_positions_have_eight_choices(self):
        for p in ['DFIR','SOCIAL','SOC','VULN','DEF','LANG','AI']:
            self.assertGreaterEqual(len([a for a in score.ASSETS if a['position']==p]),32)
        self.assertEqual(len(set(a['slug'] for a in score.ASSETS)),len(score.ASSETS))
        self.assertEqual(len(score.ASSETS),268)
        self.assertTrue(all(a['source_url'].startswith('https://') for a in score.ASSETS))

    def test_backfill_period_reduced_during_week(self):
        with patch.object(score,'TODAY',date(2026,11,16)), patch.object(score,'WEEK',date(2026,11,16)), patch.dict(score.os.environ,{'CIPHER_BACKFILL_PREVIOUS':'0'}):
            self.assertEqual(score.weeks(),(date(2026,11,9),date(2026,11,16)))
        with patch.object(score,'TODAY',date(2026,11,19)), patch.object(score,'WEEK',date(2026,11,16)), patch.dict(score.os.environ,{'CIPHER_BACKFILL_PREVIOUS':'0'}):
            self.assertEqual(score.weeks(),(date(2026,11,16),))
        with patch.object(score,'TODAY',date(2026,11,19)), patch.object(score,'WEEK',date(2026,11,16)), patch.dict(score.os.environ,{'CIPHER_BACKFILL_PREVIOUS':'1'}):
            self.assertEqual(score.weeks(),(date(2026,11,9),date(2026,11,16)))

    def test_github_queries_forward_auth_header(self):
        with patch.object(score, 'GH_TOKEN', 'test-token'), patch.object(score, 'get', return_value={'total_count':10,'incomplete_results':False}) as mockget, patch.object(score.time,'sleep'):
            score.github_search('repositories?q=language%3APython')
        self.assertEqual(mockget.call_args.kwargs['headers']['Authorization'],'Bearer test-token')

    def test_week_start_utc_monday(self):
        self.assertEqual(score.monday(date(2026,11,16)),date(2026,11,16))
        self.assertEqual(score.monday(date(2026,11,22)),date(2026,11,16))

    def test_score_cap_and_signed_stock(self):
        self.assertEqual(score.clamp(round(5+3*(-20)),-20,35),-20)
        self.assertEqual(score.clamp(round(5+3*12),-20,35),35)
        self.assertEqual(score.clamp(round(5+3*3),-20,35),14)

    def test_weekly_rows_are_traceable(self):
        a=score.ASSETS[0]
        result=score.record(a,date(2026,11,16),13,'3 merged PRs, 1 release','https://github.com/example',event_count=4)
        self.assertEqual(result['week_start'],'2026-11-16')
        self.assertEqual(result['points'],13)
        self.assertTrue(result['source_url'].startswith('https:'))


    def test_social_counts_are_not_incidents(self):
        with patch.object(score, 'gdelt_article_count',return_value=(63,'https://api.gdeltproject.org/sample')), patch.object(score.time,'sleep'):
            rows=score.ingest_social()
        self.assertTrue(rows)
        self.assertTrue(any(r['points']==12 and 'NOT verified attacks' in r['detail'] for r in rows))

    def test_stock_weekly_return_from_closes(self):
        # One synthetic EOD series: prior close 100, latest close 104.
        rows=[{'datetime':d,'close':str(p)} for d,p in [('2026-11-06',100),('2026-11-10',103),('2026-11-13',104),('2026-11-17',105)]]
        with patch.object(score,'WEEK',date(2026,11,16)),patch.object(score,'TODAY',date(2026,11,17)),patch.object(score,'STOCK_KEY','test'),patch.object(score,'get',return_value={'values':rows}),patch.object(score.time,'sleep'):
            outcome=score.ingest_stocks()
        lastweek=[r for r in outcome if r['week_start']=='2026-11-09']
        self.assertTrue(lastweek)
        self.assertEqual(lastweek[0]['points'],17)
        self.assertIn('+4.00%',lastweek[0]['detail'])

    def test_github_source_records_release_and_pr(self):
        with patch.object(score,'GH_TOKEN','test'),patch.object(score,'github_query',return_value=3),patch.object(score,'get',return_value=[{'published_at':score.WEEK.isoformat()+'T01:00:00Z'}]),patch.object(score.time,'sleep'):
            result=score.ingest_github()
        self.assertTrue(result)
        repo=[r for r in result if r['asset_slug']=='volatility' and r['week_start']==score.WEEK.isoformat()][0]
        self.assertEqual(repo['points'],17)
        self.assertEqual(repo['event_count'],4)

    def test_ai_scores_likes_growth_from_snapshots(self):
        monday=score.WEEK
        sample=[]
        for a in score.ASSETS:
            if a['provider']=='huggingface':
                sample.extend([{'asset_slug':a['slug'],'sampled_on':monday.isoformat(),'likes':100},
                               {'asset_slug':a['slug'],'sampled_on':(monday+timedelta(days=1)).isoformat(),'likes':112}])
        with patch.object(score,'URL','https://example.supabase.co'),patch.object(score,'KEY','test'),patch.object(score,'get',return_value={'likes':112}),patch.object(score,'upsert'),patch.object(score,'supabase',return_value=sample):
            result=score.ingest_ai()
        self.assertTrue(result)
        last=[r for r in result if r['week_start']==monday.isoformat()][0]
        self.assertEqual(last['points'],6)
        self.assertIn('12',last['detail'])

if __name__=='__main__':unittest.main()
