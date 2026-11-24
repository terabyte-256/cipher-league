import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from datetime import date, timedelta
from urllib.error import HTTPError

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

    def test_gdelt_retries_429_and_honors_retry_after(self):
        error=HTTPError('https://api.gdeltproject.org',429,'Too Many Requests',{'Retry-After':'7'},None)
        result={'timeline':[{'data':[{'value':'12'}]}]}
        now=[100.0]
        request_times=[]
        def sleep(seconds):now[0]+=seconds
        def get(*args,**kwargs):
            request_times.append(now[0])
            if len(request_times)==1:raise error
            return result
        with patch.object(score,'LAST_GDELT_REQUEST',94.8),patch.object(score.time,'monotonic',side_effect=lambda:now[0]),\
             patch.object(score.time,'sleep',side_effect=sleep) as mock_sleep,patch.object(score,'get',side_effect=get) as mock_get:
            count,_=score.gdelt_article_count('test',date(2026,11,16),deadline=200)
        self.assertEqual(count,12)
        self.assertEqual(mock_get.call_count,2)
        self.assertEqual(request_times[1]-request_times[0],7)
        mock_sleep.assert_called_once_with(7)
        error.close()

    def test_gdelt_retry_stops_at_time_budget_without_a_score(self):
        error=HTTPError('https://api.gdeltproject.org',429,'Too Many Requests',{'Retry-After':'60'},None)
        with patch.object(score,'LAST_GDELT_REQUEST',0),patch.object(score.time,'monotonic',return_value=100),\
             patch.object(score.time,'sleep') as sleep,patch.object(score,'get',side_effect=error) as get:
            with self.assertRaises(TimeoutError):
                score.gdelt_article_count('test',date(2026,11,16),deadline=101)
        get.assert_called_once()
        sleep.assert_not_called()
        error.close()

    def test_social_budget_leaves_unqueried_asset_weeks_pending(self):
        assets=[{'provider':'gdelt','slug':'one','key':'one'},{'provider':'gdelt','slug':'two','key':'two'}]
        with patch.object(score,'ASSETS',assets),patch.object(score,'weeks',return_value=(date(2026,11,16),)),\
             patch.object(score,'GDELT_TIME_BUDGET',0):
            rows=score.ingest_social()
        self.assertEqual(rows,[])
        self.assertEqual(score.STATUS['GDELT']['pending'],2)

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
