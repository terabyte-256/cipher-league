#!/usr/bin/env python3
"""Daily, server-only real-world signal importer for Cipher League v3.1.

Never exposes the service role or market-data key to the website. Missing or
unauthorized providers are SKIPPED, not replaced with fictional scores.
Run in GitHub Actions via secrets. All weeks begin Monday 00:00 UTC.
"""
from __future__ import annotations
import argparse
from collections import defaultdict
from datetime import datetime, date, timedelta, timezone
from email.utils import parsedate_to_datetime
import json
import math
import os
from pathlib import Path
import re
import sys
import time
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[1]
ASSETS = json.loads((ROOT/'site/data/assets.json').read_text())
CISA = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'
CISA_MIRROR = 'https://raw.githubusercontent.com/CISAgov/kev-data/develop/known_exploited_vulnerabilities.json'
GITHUB = 'https://api.github.com'
GDELT = 'https://api.gdeltproject.org/api/v2/doc/doc'
HF = 'https://huggingface.co/api/models/'
NOW = datetime.now(timezone.utc)
TODAY = NOW.date()
WEEK = TODAY - timedelta(days=TODAY.weekday())
URL = os.getenv('SUPABASE_URL','').rstrip('/')
KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY','')
GH_TOKEN = os.getenv('GH_TOKEN','') or os.getenv('GITHUB_TOKEN','')
STOCK_KEY = os.getenv('TWELVEDATA_API_KEY','')
STATUS = defaultdict(lambda: {'success':0,'failed':0})
LAST_SEARCH = 0.0
LAST_GDELT_REQUEST = 0.0
GDELT_MIN_INTERVAL = 5.1
GDELT_TIME_BUDGET = 15 * 60
GDELT_MAX_ATTEMPTS = 4


def get(url, headers=None, json_result=True, timeout=40):
    h={'User-Agent':'CipherLeague/3.0 (public-sources; educational fantasy competition)',
       'Accept':'application/json',**(headers or {})}
    req=Request(url,headers=h)
    with urlopen(req,timeout=timeout) as r:
        data=r.read()
    return json.loads(data) if json_result else data


def supabase(table, method='GET', rows=None, query=''):
    if not (URL and KEY):
        return []
    url=f'{URL}/rest/v1/{table}{query}'
    headers={'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json'}
    if method=='POST':
        headers['Prefer']='resolution=merge-duplicates,return=minimal'
    data=json.dumps(rows).encode() if method=='POST' else None
    req=Request(url,method=method,headers=headers,data=data)
    with urlopen(req,timeout=50) as r:
        value=r.read()
    return json.loads(value) if value else []


def upsert(table,rows,conflict):
    if not rows:return
    if not (URL and KEY):
        print(f'LOCAL ONLY: {table}: {len(rows)} rows (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to publish)')
        return
    for i in range(0,len(rows),100):
        try:
            supabase(table,'POST',rows[i:i+100],f'?on_conflict={conflict}')
        except HTTPError as ex:
            print('Supabase response:',ex.read().decode('utf8','replace')[:500],file=sys.stderr)
            raise
    print(f'UPSERT {table}: {len(rows)} rows')


def monday(day): return day-timedelta(days=day.weekday())
def clamp(n,lo,hi): return max(lo,min(hi,n))
def weeks():
    # Backfill the just-closed week for three days, or whenever explicitly
    # requested. Other days score only the current week to avoid thousands of
    # expensive daily API calls. Prior snapshots remain in Supabase.
    if TODAY.weekday() <= 2 or os.getenv('CIPHER_BACKFILL_PREVIOUS') == '1':
        return (WEEK-timedelta(days=7), WEEK)
    return (WEEK,)

def iso(day): return day.isoformat()
def record(a,week,points,detail,source_url,metric='',event_count=0):
    return dict(asset_slug=a['slug'],week_start=iso(week),points=int(points),
                event_count=int(event_count),metric=metric[:100],detail=detail[:1000],source_url=source_url,
                updated_at=NOW.isoformat())


def ingest_cisa():
    aliases={}
    for a in ASSETS:
        if a['position']=='VULN':
            for alias in a['aliases']:
                norm=alias.casefold().strip()
                if norm in aliases:raise ValueError('Duplicate CISA alias '+alias)
                aliases[norm]=a
    for source in (CISA_MIRROR,CISA):
        try:
            feed=get(source)
            if not isinstance(feed.get('vulnerabilities'),list) or len(feed['vulnerabilities'])!=feed.get('count'):
                raise ValueError('CISA catalog count mismatch')
            break
        except Exception as ex:
            print('CISA fetch:',source,ex,file=sys.stderr)
    else:
        STATUS['CISA']['failed']+=1
        return []
    events=[]
    for v in feed['vulnerabilities']:
        cve=v.get('cveID','')
        if not re.fullmatch(r'CVE-\d{4}-\d{4,}',cve):continue
        a=aliases.get(v.get('vendorProject','').casefold().strip())
        if not a:continue
        try: date_added=date.fromisoformat(v['dateAdded'])
        except (KeyError,ValueError):continue
        events.append(dict(cve_id=cve,date_added=iso(date_added),asset_slug=a['slug'],
                           vendor=v.get('vendorProject','')[:150],product=v.get('product','')[:250],
                           title=v.get('vulnerabilityName','')[:500],
                           ransomware=(v.get('knownRansomwareCampaignUse')=='Known')))
    # Save a recent evidence snapshot even when no Supabase project is connected.
    events.sort(key=lambda e:(e['date_added'],e['cve_id']),reverse=True)
    (ROOT/'site/data/events.json').write_text(json.dumps({
      'source':'CISA Known Exploited Vulnerabilities','source_url':CISA,
      'catalog_version':feed.get('catalogVersion'),'released_at':feed.get('dateReleased'),
      'sample':False,'events':events[:100]},indent=2)+'\n')
    upsert('kev_events',events,'cve_id')
    aggregate=defaultdict(list)
    for e in events:
        d=date.fromisoformat(e['date_added'])
        if monday(d) in weeks():aggregate[(e['asset_slug'],monday(d))].append(e)
    rows=[]
    for a in ASSETS:
        if a['position']!='VULN':continue
        for w in weeks():
            group=aggregate[(a['slug'],w)]
            points=sum(12+6*int(e['ransomware']) for e in group)
            samples=', '.join(e['cve_id'] for e in group[:8]) or 'No new entries on the list this week'
            rows.append(record(a,w,points,samples,CISA,metric=f'{len(group)} KEV additions',event_count=len(group)))
    STATUS['CISA']['success']+=len(rows)
    return rows


def github_search(q):
    global LAST_SEARCH
    # GitHub Search API: respect 30 authenticated searches/minute, even in cron.
    delay=2.25-(time.monotonic()-LAST_SEARCH)
    if delay>0:time.sleep(delay)
    LAST_SEARCH=time.monotonic()
    headers={'Accept':'application/vnd.github+json'}
    if GH_TOKEN: headers['Authorization']='Bearer '+GH_TOKEN
    data=get(GITHUB+'/search/'+q,headers=headers)
    if not isinstance(data.get('total_count'),int) or data.get('incomplete_results'):
        raise ValueError('Incomplete GitHub search; preserve previous stored score')
    return data['total_count']


def github_query(endpoint,q):
    return github_search(endpoint+'?'+urlencode({'q':q,'per_page':1}))


def ingest_github():
    if not GH_TOKEN:
        print('SKIP GitHub: set GH_TOKEN (token kept in GitHub Actions secrets).')
        return []
    scores=[]
    for a in ASSETS:
        if a['provider'] not in ('github_repo','github_language'):continue
        for w in weeks():
            end=w+timedelta(days=6)
            # Future week returns 0 but preserve only current or prior week.
            period=f'{iso(w)}..{iso(end)}'
            try:
                if a['provider']=='github_language':
                    q=f'language:{a["key"]} created:{period} fork:false'
                    count=github_query('repositories',q)
                    points=clamp(round(2*math.log2(1+count)),0,30)
                    source='https://github.com/search?'+urlencode({'q':q,'type':'repositories'})
                    scores.append(record(a,w,points,f'About {count} new public repositories',source,
                                         metric=f'{count} new repos',event_count=count))
                else:
                    repo=a['key']
                    q=f'repo:{repo} is:pr is:merged merged:{period}'
                    merged=github_query('issues',q)
                    headers={'Authorization':'Bearer '+GH_TOKEN,'Accept':'application/vnd.github+json'}
                    releases=get(f'{GITHUB}/repos/{repo}/releases?per_page=30',headers=headers)
                    if not isinstance(releases,list):raise ValueError('Invalid releases response')
                    published=sum(1 for r in releases if not r.get('draft') and r.get('published_at') and
                                  iso(w)<=r['published_at'][:10]<=iso(end))
                    points=clamp(3*merged+8*published,0,30)
                    source='https://github.com/'+repo+'/pulls?q='+quote('is:pr is:merged merged:'+period)
                    scores.append(record(a,w,points,f'{merged} merged pull requests, {published} releases',source,
                                         metric=f'{merged} PRs / {published} releases',event_count=merged+published))
                STATUS['GitHub']['success']+=1
            except Exception as ex:
                STATUS['GitHub']['failed']+=1
                print('GitHub skipped',a['slug'],iso(w),str(ex)[:140],file=sys.stderr)
    return scores


def gdelt_article_count(query,w,deadline=None):
    params={'query':query+' sourcelang:english','mode':'timelinevolraw','format':'json',
            'startdatetime':w.strftime('%Y%m%d')+'000000',
            'enddatetime':(w+timedelta(days=7)).strftime('%Y%m%d')+'000000'}
    url=GDELT+'?'+urlencode(params)
    global LAST_GDELT_REQUEST
    deadline=deadline or time.monotonic()+GDELT_TIME_BUDGET
    for attempt in range(GDELT_MAX_ATTEMPTS):
        delay=GDELT_MIN_INTERVAL-(time.monotonic()-LAST_GDELT_REQUEST)
        if delay>0:
            if delay>=deadline-time.monotonic():raise TimeoutError('GDELT time budget exhausted')
            time.sleep(delay)
        remaining=deadline-time.monotonic()
        if remaining<=0:raise TimeoutError('GDELT time budget exhausted')
        LAST_GDELT_REQUEST=time.monotonic()
        try:
            result=get(url,timeout=min(40,remaining))
            break
        except HTTPError as ex:
            if ex.code!=429 or attempt+1==GDELT_MAX_ATTEMPTS:raise
            retry_after=ex.headers.get('Retry-After')
            try:
                retry_delay=max(0,float(retry_after))
            except (TypeError,ValueError):
                try:
                    retry_delay=max(0,(parsedate_to_datetime(retry_after)-datetime.now(timezone.utc)).total_seconds())
                except (TypeError,ValueError,OverflowError):
                    retry_delay=5*(2**attempt)
            if retry_delay==0:retry_delay=5*(2**attempt)
            if retry_delay>=deadline-time.monotonic():raise TimeoutError('GDELT retry exceeds time budget') from ex
            time.sleep(retry_delay)
    # A successful reply of exactly {} is how GDELT says nothing matched.
    if result=={}:return 0,url
    series=result.get('timeline',[])
    if not series or not isinstance(series[0].get('data'),list):raise ValueError('Invalid GDELT timeline: '+json.dumps(result)[:80])
    count=sum(int(round(float(x['value']))) for x in series[0]['data'] if x.get('value') is not None)
    return count,url


def social_targets():
    """Asset-weeks still worth querying: missing ones first, then the stalest.

    GDELT throttles too hard to cover everything in one run, so repeated runs
    each pick up where the last one stopped, using what Supabase already holds.
    """
    assets=[a for a in ASSETS if a['provider']=='gdelt']
    if not (URL and KEY):
        return [(a,w) for a in assets for w in weeks()]
    both=(WEEK-timedelta(days=7),WEEK)
    stored=supabase('asset_week_scores',query='?select=asset_slug,week_start,updated_at'
        +'&week_start=in.('+','.join(iso(w) for w in both)+')'
        +'&asset_slug=in.('+','.join(quote(a['slug']) for a in assets)+')&limit=1000')
    seen={(r['asset_slug'],r['week_start']):datetime.fromisoformat(r['updated_at'].replace('Z','+00:00')) for r in stored}
    targets=[]
    for a in assets:
        for w in both:
            at=seen.get((a['slug'],iso(w)))
            if at:
                # A closed week fetched after it ended is final; an open week
                # only needs refreshing about once a day.
                if w<WEEK and at.date()>=w+timedelta(days=7):continue
                if w==WEEK and NOW-at<timedelta(hours=20):continue
            targets.append((at or datetime.min.replace(tzinfo=timezone.utc),w,a))
    targets.sort(key=lambda t:(t[0],t[1]))
    return [(a,w) for _,w,a in targets]


def ingest_social():
    out=[]
    STATUS['GDELT'].setdefault('pending',0)
    targets=social_targets()
    deadline=time.monotonic()+GDELT_TIME_BUDGET
    for index,(a,w) in enumerate(targets):
        if time.monotonic()>=deadline:
            STATUS['GDELT']['pending']+=len(targets)-index
            print(f'GDELT time budget exhausted; {len(targets)-index} asset-weeks remain pending',file=sys.stderr)
            break
        try:
            count,url=gdelt_article_count(a['key'],w,deadline)
            out.append(record(a,w,clamp(round(2*math.log2(1+count)),0,30),
                f'{count} English-language news articles (coverage, not confirmed attacks)',
                url,metric=f'{count} news mentions',event_count=count))
            STATUS['GDELT']['success']+=1
        except Exception as ex:
            STATUS['GDELT']['failed']+=1
            print('GDELT skipped',a['slug'],iso(w),str(ex)[:140],file=sys.stderr)
    return out


def ingest_ai():
    updated=[]
    for a in ASSETS:
        if a['provider']!='huggingface':continue
        try:
            result=get(HF+quote(a['key'],safe='/'))
            likes=result.get('likes')
            if not isinstance(likes,int) or likes<0:raise ValueError('Invalid Hugging Face likes')
            updated.append(dict(asset_slug=a['slug'],sampled_on=iso(TODAY),likes=likes))
            STATUS['Hugging Face']['success']+=1
        except Exception as ex:
            STATUS['Hugging Face']['failed']+=1
            print('HF skipped',a['slug'],str(ex)[:140],file=sys.stderr)
    upsert('ai_snapshots',updated,'asset_slug,sampled_on')
    if not (URL and KEY):
        print('AI scoring requires historical daily snapshots in Supabase: first run records the baseline.')
        return []
    stored=supabase('ai_snapshots',query='?select=asset_slug,sampled_on,likes&sampled_on=gte.'+iso(WEEK-timedelta(days=15))+'&limit=1000')
    by_slug=defaultdict(list)
    for r in stored:
        by_slug[r['asset_slug']].append(r)
    scores=[]
    for a in ASSETS:
        if a['provider']!='huggingface':continue
        snapshots=sorted(by_slug.get(a['slug'],[]),key=lambda r:r['sampled_on'])
        for w in weeks():
            # Baseline is the most recent snapshot ON/BEFORE Monday. If project
            # was initialized late, anchor to first snapshot in that week.
            eligible=[r for r in snapshots if r['sampled_on']<iso(w+timedelta(days=7))]
            previous=[r for r in eligible if r['sampled_on']<=iso(w)]
            interior=[r for r in eligible if r['sampled_on']>=iso(w)]
            if not interior:continue
            baseline=(previous[-1] if previous else interior[0])
            latest=interior[-1]
            delta=max(0,latest['likes']-baseline['likes'])
            scores.append(record(a,w,clamp(round(delta/2),0,30),
                f'{delta} new likes from {baseline["sampled_on"]} to {latest["sampled_on"]}',
                'https://huggingface.co/'+a['key'],metric=f'+{delta} likes',event_count=delta))
    return scores


def ingest_stocks():
    if not STOCK_KEY:
        print('SKIP stocks: TWELVEDATA_API_KEY missing. Public launch requires a provider plan authorizing external display of derived scores.')
        return []
    scores=[]
    first=min(weeks())-timedelta(days=10)
    for a in ASSETS:
        if a['provider']!='twelvedata':continue
        params={'symbol':a['key'],'interval':'1day','start_date':iso(first),
                'end_date':iso(TODAY),'outputsize':100,'adjust':'splits','apikey':STOCK_KEY,'order':'asc'}
        try:
            result=get('https://api.twelvedata.com/time_series?'+urlencode(params))
            if result.get('status')=='error':raise ValueError(result.get('message','Provider error'))
            candles=result.get('values')
            if not isinstance(candles,list) or len(candles)<2:raise ValueError('Missing daily close prices')
            closes=sorted((date.fromisoformat(x['datetime']),float(x['close'])) for x in candles if float(x['close'])>0)
            for w in weeks():
                prev=[x for x in closes if x[0]<w]
                intraw=[x for x in closes if w<=x[0]<w+timedelta(days=7)]
                if not prev or not intraw:continue
                baseline=prev[-1];last=intraw[-1]
                pct=(last[1]/baseline[1]-1)*100
                points=clamp(round(5+3*pct),-20,35)
                scores.append(record(a,w,points,
                    f'{pct:+.2f}% from the {iso(baseline[0])} close to the {iso(last[0])} close',
                    'https://twelvedata.com/',metric=f'{pct:+.2f}% weekly',event_count=1))
                STATUS['Twelve Data']['success']+=1
            time.sleep(float(os.getenv('TWELVEDATA_DELAY_SECONDS','8.2')))
        except Exception as ex:
            STATUS['Twelve Data']['failed']+=1
            print('Stock skipped',a['key'],str(ex)[:140],file=sys.stderr)
    return scores


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--source',choices=['all','cisa','github','social','ai','stock'],default='all')
    args=ap.parse_args()
    sources={'cisa':ingest_cisa,'github':ingest_github,'social':ingest_social,'ai':ingest_ai,'stock':ingest_stocks}
    chosen=sources.items() if args.source=='all' else [(args.source,sources[args.source])]
    rows=[];failed_sources=[]
    for name,fn in chosen:
        print('===',name,'===',flush=True)
        try: rows.extend(fn())
        except Exception as ex:
            print('ERROR IN',name,':',str(ex)[:300],file=sys.stderr)
            STATUS[name]['failed']+=1;failed_sources.append(name)
    upsert('asset_week_scores',rows,'asset_slug,week_start')
    print('SUMMARY:',json.dumps(dict(STATUS)))
    print('Total updated score records:',len(rows))
    if not rows:
        print('No scores updated: check provider API keys, network and rate limits.',file=sys.stderr)
    if failed_sources:
        print('FAILED SOURCES:',', '.join(failed_sources),file=sys.stderr)
        sys.exit(1)

if __name__=='__main__':main()
