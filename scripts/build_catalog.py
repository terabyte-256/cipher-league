#!/usr/bin/env python3
"""Rebuild the category-locked, source-linked Cyber Fantasy candidate catalog.

All choices have a real underlying data-source identifier. Some projects may be
archived, renamed or quiet; use validate_catalog.py --online to check current
API availability before public launch. Slugs for the original 83 are preserved.
"""
import json
from collections import Counter
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
ASSETS = []
POSITIONS = ('DFIR', 'SOCIAL', 'SOC', 'VULN', 'DEF', 'LANG', 'AI')
MIN_CHOICES = 30


def add(position, slug, name, provider, key, **extra):
    ASSETS.append(dict(slug=slug, name=name, position=position,
                       provider=provider, key=key, **extra))


# Digital forensics / incident-response tools with publicly tracked repositories.
for slug, name, repo in [
    ('volatility', 'Volatility 3', 'volatilityfoundation/volatility3'),
    ('velociraptor', 'Velociraptor', 'Velocidex/velociraptor'),
    ('autopsy', 'Autopsy', 'sleuthkit/autopsy'),
    ('plaso', 'Plaso', 'log2timeline/plaso'),
    ('timesketch', 'Timesketch', 'google/timesketch'),
    ('hayabusa', 'Hayabusa', 'Yamato-Security/hayabusa'),
    ('chainsaw', 'Chainsaw', 'WithSecureLabs/chainsaw'),
    ('wireshark', 'Wireshark', 'wireshark/wireshark'),
    ('rekall', 'Rekall', 'google/rekall'),
    ('osquery', 'osquery', 'osquery/osquery'),
    ('sleuthkit', 'The Sleuth Kit', 'sleuthkit/sleuthkit'),
    ('grr', 'GRR Rapid Response', 'google/grr'),
    ('turbinia', 'Turbinia', 'google/turbinia'),
    ('dfvfs', 'dfVFS', 'log2timeline/dfvfs'),
    ('dfwinreg', 'dfWinReg', 'log2timeline/dfwinreg'),
    ('dtformats', 'dtFormats', 'log2timeline/dtformats'),
    ('dfimagetools', 'dfImageTools', 'log2timeline/dfimagetools'),
    ('dftimewolf', 'dftimewolf', 'log2timeline/dftimewolf'),
    ('artifact-definitions', 'Forensic Artifact Definitions', 'ForensicArtifacts/artifacts'),
    ('libewf', 'libewf', 'libyal/libewf'),
    ('libevtx', 'libevtx', 'libyal/libevtx'),
    ('libregf', 'libregf', 'libyal/libregf'),
    ('libfsntfs', 'libfsntfs', 'libyal/libfsntfs'),
    ('libvshadow', 'libvshadow', 'libyal/libvshadow'),
    ('libfsapfs', 'libfsapfs', 'libyal/libfsapfs'),
    ('libvhdi', 'libvhdi', 'libyal/libvhdi'),
    ('libqcow', 'libqcow', 'libyal/libqcow'),
    ('flare-floss', 'FLOSS Malware String Decoder', 'mandiant/flare-floss'),
    ('capa', 'capa Malware Capability Analyzer', 'mandiant/capa'),
    ('goresym', 'GoReSym', 'mandiant/GoReSym'),
    ('avml', 'Azure VM Memory Dump', 'microsoft/avml'),
    ('lime', 'LiME Memory Extractor', '504ensicsLabs/LiME'),
    ('cyberchef', 'CyberChef', 'gchq/CyberChef'),
]:
    add('DFIR', slug, name, 'github_repo', repo)


# Themes are news-coverage predictions, not endorsements or attack instructions.
for slug, name, query in [
    ('phishing', 'Phishing', '("phishing attack" OR "phishing campaign")'),
    ('smishing', 'SMS Phishing', '("smishing" OR "SMS phishing")'),
    ('vishing', 'Voice Phishing', '("vishing" OR "voice phishing")'),
    ('bec', 'Business Email Compromise', '("business email compromise" OR "BEC scam")'),
    ('quishing', 'QR Code Phishing', '("QR code phishing" OR "quishing")'),
    ('mfa-fatigue', 'MFA Fatigue', '("MFA fatigue" OR "push bombing")'),
    ('deepfake-scams', 'Deepfake Impersonation', '("deepfake scam" OR "deepfake fraud")'),
    ('credential-theft', 'Credential Harvesting', '("credential phishing" OR "credential harvesting")'),
    ('tech-support', 'Tech Support Scams', '("tech support scam" OR "technical support fraud")'),
    ('romance-scams', 'Romance Scams', '("romance scam" OR "romance fraud")'),
    ('spear-phishing', 'Spear Phishing', '("spear phishing" OR "targeted phishing")'),
    ('whaling-attacks', 'Executive Whaling', '("whaling phishing" OR "executive phishing")'),
    ('phishing-kits', 'Phishing Kits', '("phishing kit" OR "phishing as a service")'),
    ('callback-phishing', 'Callback Phishing', '("callback phishing" OR "TOAD phishing")'),
    ('oauth-phishing', 'OAuth Consent Phishing', '("OAuth consent phishing" OR "OAuth phishing")'),
    ('device-code-phishing', 'Device Code Phishing', '("device code phishing" OR "device code scam")'),
    ('sim-swap', 'SIM Swapping', '("SIM swap fraud" OR "SIM swapping attack")'),
    ('otp-scams', 'One-Time Passcode Scams', '("OTP scam" OR "one time password phishing")'),
    ('job-scams', 'Fake Job Recruitment', '("fake job offer" OR "recruitment scam")'),
    ('fake-captcha', 'Fake CAPTCHA Attacks', '("fake CAPTCHA" OR "ClickFix attack")'),
    ('fake-browser-update', 'Fake Browser Updates', '("fake browser update" OR "browser update scam")'),
    ('malvertising', 'Malvertising', '("malvertising" OR "malicious advertisements")'),
    ('typosquatting', 'Typosquatting', '("typosquatting attack" OR "typosquatting campaign")'),
    ('domain-spoofing', 'Domain Spoofing', '("email domain spoofing" OR "domain impersonation")'),
    ('brand-impersonation', 'Brand Impersonation', '("brand impersonation" OR "impersonation phishing")'),
    ('ceo-fraud', 'CEO Fraud', '("CEO fraud" OR "executive impersonation scam")'),
    ('invoice-scams', 'Invoice Fraud', '("invoice fraud" OR "invoice phishing")'),
    ('gift-card-scams', 'Gift Card Scams', '("gift card scam" OR "gift card fraud")'),
    ('pig-butchering', 'Pig Butchering Fraud', '("pig butchering scam" OR "pig butchering fraud")'),
    ('voice-cloning', 'AI Voice Cloning Scams', '("voice cloning scam" OR "AI voice impersonation")'),
    ('social-account-takeover', 'Social Account Takeover', '("social media account takeover" OR "social account hijacking")'),
    ('social-media-phishing', 'Social Media Phishing', '("social media phishing" OR "Instagram phishing")'),
    ('fake-support-chat', 'Fake Support Chat', '("fake customer support" OR "fake support chat scam")'),
    ('charity-scams', 'Charity Impersonation Scams', '("fake charity scam" OR "charity impersonation fraud")'),
    ('delivery-scams', 'Delivery Notification Scams', '("package delivery scam" OR "parcel delivery phishing")'),
    ('tax-scams', 'Tax Agency Impersonation', '("IRS impersonation scam" OR "tax authority phishing")'),
]:
    add('SOCIAL', slug, name, 'gdelt', query)


# SOC, blue-team detection, threat hunting, and security-monitoring projects.
for slug, name, repo in [
    ('sigma', 'Sigma Rules', 'SigmaHQ/sigma'),
    ('elastic-detections', 'Elastic Detection Rules', 'elastic/detection-rules'),
    ('wazuh', 'Wazuh', 'wazuh/wazuh'),
    ('splunk-security', 'Splunk Security Content', 'splunk/security_content'),
    ('suricata', 'Suricata', 'OISF/suricata'),
    ('zeek', 'Zeek', 'zeek/zeek'),
    ('crowdsec', 'CrowdSec', 'crowdsecurity/crowdsec'),
    ('yara', 'YARA', 'VirusTotal/yara'),
    ('falco', 'Falco', 'falcosecurity/falco'),
    ('security-onion', 'Security Onion', 'Security-Onion-Solutions/securityonion'),
    ('sigma-cli', 'Sigma CLI', 'SigmaHQ/sigma-cli'),
    ('pysigma', 'pySigma', 'SigmaHQ/pySigma'),
    ('pysigma-splunk', 'pySigma Splunk Backend', 'SigmaHQ/pySigma-backend-splunk'),
    ('pysigma-elastic', 'pySigma Elasticsearch Backend', 'SigmaHQ/pySigma-backend-elasticsearch'),
    ('suricata-update', 'suricata-update', 'OISF/suricata-update'),
    ('zeek-packages', 'Zeek Packages', 'zeek/packages'),
    ('fleet', 'Fleet Endpoint Management', 'fleetdm/fleet'),
    ('ossec', 'OSSEC HIDS', 'ossec/ossec-hids'),
    ('snort3', 'Snort 3', 'snort3/snort3'),
    ('snort-daq', 'Snort LibDAQ', 'snort3/libdaq'),
    ('falco-rules', 'Falco Rules', 'falcosecurity/rules'),
    ('falco-plugins', 'Falco Plugins', 'falcosecurity/plugins'),
    ('tetragon', 'Tetragon', 'cilium/tetragon'),
    ('cilium', 'Cilium', 'cilium/cilium'),
    ('yara-x', 'YARA-X', 'VirusTotal/yara-x'),
    ('sentinel', 'Microsoft Sentinel Content', 'Azure/Azure-Sentinel'),
    ('defender-hunting', 'Defender Hunting Queries', 'microsoft/Microsoft-365-Defender-Hunting-Queries'),
    ('loki-scanner', 'LOKI IOC Scanner', 'Neo23x0/Loki'),
    ('signature-base', 'THOR Signature Base', 'Neo23x0/signature-base'),
    ('opensearch-security', 'OpenSearch Security Analytics', 'opensearch-project/security-analytics'),
    ('opencti', 'OpenCTI', 'OpenCTI-Platform/opencti'),
    ('cortex-analyzers', 'Cortex Analyzers', 'TheHive-Project/Cortex-Analyzers'),
    ('thehive-cortex', 'Cortex Threat Intel', 'TheHive-Project/Cortex'),
    ('velociraptor-sigma', 'Sigma Correlation Rules', 'SigmaHQ/sigma-specification'),
]:
    add('SOC', slug, name, 'github_repo', repo)


# Exact CISA vendorProject aliases; unmatched vendors correctly get zero additions.
for slug, name, aliases in [
    ('microsoft-kev', 'Microsoft (KEV)', ['Microsoft']),
    ('cisco-kev', 'Cisco (KEV)', ['Cisco']),
    ('google-kev', 'Google (KEV)', ['Google']),
    ('apple-kev', 'Apple (KEV)', ['Apple']),
    ('adobe-kev', 'Adobe (KEV)', ['Adobe']),
    ('fortinet-kev', 'Fortinet (KEV)', ['Fortinet']),
    ('ivanti-kev', 'Ivanti (KEV)', ['Ivanti']),
    ('vmware-kev', 'VMware (KEV)', ['VMware']),
    ('atlassian-kev', 'Atlassian (KEV)', ['Atlassian']),
    ('oracle-kev', 'Oracle (KEV)', ['Oracle']),
    ('juniper-kev', 'Juniper (KEV)', ['Juniper']),
    ('paloalto-kev', 'Palo Alto Networks (KEV)', ['Palo Alto Networks']),
    ('sophos-kev', 'Sophos (KEV)', ['Sophos']),
    ('checkpoint-kev', 'Check Point (KEV)', ['Check Point']),
    ('citrix-kev', 'Citrix (KEV)', ['Citrix']),
    ('f5-kev', 'F5 (KEV)', ['F5']),
    ('dlink-kev', 'D-Link (KEV)', ['D-Link']),
    ('zyxel-kev', 'Zyxel (KEV)', ['Zyxel']),
    ('sonicwall-kev', 'SonicWall (KEV)', ['SonicWall']),
    ('sap-kev', 'SAP (KEV)', ['SAP']),
    ('apache-kev', 'Apache (KEV)', ['Apache', 'Apache Software Foundation']),
    ('jenkins-kev', 'Jenkins (KEV)', ['Jenkins']),
    ('linux-kev', 'Linux (KEV)', ['Linux']),
    ('mozilla-kev', 'Mozilla (KEV)', ['Mozilla']),
    ('tplink-kev', 'TP-Link (KEV)', ['TP-Link']),
    ('netgear-kev', 'NETGEAR (KEV)', ['NETGEAR']),
    ('samsung-kev', 'Samsung (KEV)', ['Samsung']),
    ('ibm-kev', 'IBM (KEV)', ['IBM']),
    ('dell-kev', 'Dell (KEV)', ['Dell']),
    ('hp-kev', 'HP (KEV)', ['HP']),
    ('hpe-kev', 'HPE (KEV)', ['Hewlett Packard Enterprise', 'HPE']),
    ('progress-kev', 'Progress (KEV)', ['Progress']),
    ('veeam-kev', 'Veeam (KEV)', ['Veeam']),
    ('solarwinds-kev', 'SolarWinds (KEV)', ['SolarWinds']),
    ('zoho-kev', 'Zoho (KEV)', ['Zoho']),
    ('gitlab-kev', 'GitLab (KEV)', ['GitLab']),
    ('trendmicro-kev', 'Trend Micro (KEV)', ['Trend Micro']),
    ('mikrotik-kev', 'MikroTik (KEV)', ['MikroTik']),
    ('connectwise-kev', 'ConnectWise (KEV)', ['ConnectWise']),
    ('pulse-kev', 'Pulse Secure (KEV)', ['Pulse Secure']),
]:
    add('VULN', slug, name, 'cisa', aliases[0], aliases=aliases)


# Publicly listed tech stocks (no unlisted brands or made-up ticker symbols).
for ticker, name in [
    ('AAPL', 'Apple'), ('MSFT', 'Microsoft'), ('GOOGL', 'Alphabet'),
    ('NVDA', 'NVIDIA'), ('AMZN', 'Amazon'), ('META', 'Meta'),
    ('AMD', 'AMD'), ('INTC', 'Intel'), ('ORCL', 'Oracle'),
    ('CSCO', 'Cisco'), ('ADBE', 'Adobe'), ('CRM', 'Salesforce'),
    ('IBM', 'IBM'), ('AVGO', 'Broadcom'), ('NOW', 'ServiceNow'),
    ('CRWD', 'CrowdStrike'), ('PANW', 'Palo Alto Networks'),
    ('FTNT', 'Fortinet'), ('ZS', 'Zscaler'), ('NET', 'Cloudflare'),
    ('OKTA', 'Okta'), ('DDOG', 'Datadog'), ('SNOW', 'Snowflake'),
    ('PLTR', 'Palantir'), ('TSLA', 'Tesla'), ('NFLX', 'Netflix'),
    ('SHOP', 'Shopify'), ('UBER', 'Uber'), ('ABNB', 'Airbnb'),
    ('DELL', 'Dell Technologies'), ('HPQ', 'HP Inc.'),
    ('HPE', 'Hewlett Packard Enterprise'), ('MU', 'Micron'),
    ('QCOM', 'Qualcomm'), ('TSM', 'TSMC'), ('ARM', 'Arm'),
    ('ASML', 'ASML'), ('AKAM', 'Akamai'), ('MDB', 'MongoDB'),
    ('ESTC', 'Elastic'), ('GTLB', 'GitLab'), ('TEAM', 'Atlassian'),
    ('S', 'SentinelOne'), ('TENB', 'Tenable'), ('QLYS', 'Qualys'),
]:
    add('DEF', 'stock-' + ticker.lower(), f'{name} · {ticker}', 'twelvedata', ticker)


# GitHub Linguist language names; case/punctuation matter for the search API.
for slug, name, key in [
    ('python', 'Python', 'Python'), ('javascript', 'JavaScript', 'JavaScript'),
    ('typescript', 'TypeScript', 'TypeScript'), ('rust', 'Rust', 'Rust'),
    ('go', 'Go', 'Go'), ('java', 'Java', 'Java'), ('cpp', 'C++', 'C++'),
    ('csharp', 'C#', 'C#'), ('kotlin', 'Kotlin', 'Kotlin'),
    ('swift', 'Swift', 'Swift'), ('ruby', 'Ruby', 'Ruby'),
    ('php', 'PHP', 'PHP'), ('zig', 'Zig', 'Zig'), ('dart', 'Dart', 'Dart'),
    ('c', 'C', 'C'), ('r', 'R', 'R'), ('shell', 'Shell', 'Shell'),
    ('powershell', 'PowerShell', 'PowerShell'), ('lua', 'Lua', 'Lua'),
    ('haskell', 'Haskell', 'Haskell'), ('elixir', 'Elixir', 'Elixir'),
    ('erlang', 'Erlang', 'Erlang'), ('scala', 'Scala', 'Scala'),
    ('ocaml', 'OCaml', 'OCaml'), ('julia', 'Julia', 'Julia'),
    ('perl', 'Perl', 'Perl'), ('objectivec', 'Objective-C', 'Objective-C'),
    ('groovy', 'Groovy', 'Groovy'), ('clojure', 'Clojure', 'Clojure'),
    ('assembly', 'Assembly', 'Assembly'), ('solidity', 'Solidity', 'Solidity'),
    ('nix', 'Nix', 'Nix'), ('fortran', 'Fortran', 'Fortran'),
    ('matlab', 'MATLAB', 'MATLAB'), ('fsharp', 'F#', 'F#'),
    ('nim', 'Nim', 'Nim'), ('crystal', 'Crystal', 'Crystal'),
    ('prolog', 'Prolog', 'Prolog'), ('elm', 'Elm', 'Elm'),
    ('verilog', 'Verilog', 'Verilog'),
]:
    add('LANG', 'lang-' + slug, name, 'github_language', key)


# Public model repositories on Hugging Face; snapshots measure *likes* changes.
for slug, name, model in [
    ('llama', 'Llama 3.3 70B', 'meta-llama/Llama-3.3-70B-Instruct'),
    ('deepseek-r1', 'DeepSeek R1', 'deepseek-ai/DeepSeek-R1'),
    ('deepseek-v3', 'DeepSeek V3', 'deepseek-ai/DeepSeek-V3'),
    ('qwen3-8b', 'Qwen3 8B', 'Qwen/Qwen3-8B'),
    ('qwen3-32b', 'Qwen3 32B', 'Qwen/Qwen3-32B'),
    ('gemma3', 'Gemma 3 27B', 'google/gemma-3-27b-it'),
    ('phi4', 'Phi-4 Mini', 'microsoft/Phi-4-mini-instruct'),
    ('mistral-small', 'Mistral Small 3.1', 'mistralai/Mistral-Small-3.1-24B-Instruct-2503'),
    ('smollm2', 'SmolLM2 1.7B', 'HuggingFaceTB/SmolLM2-1.7B-Instruct'),
    ('olmo2', 'OLMo 2 7B', 'allenai/OLMo-2-1124-7B-Instruct'),
    ('deepseek-distill8b', 'DeepSeek R1 Distill Llama 8B', 'deepseek-ai/DeepSeek-R1-Distill-Llama-8B'),
    ('deepseek-distill32b', 'DeepSeek R1 Distill Qwen 32B', 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B'),
    ('qwen3-4b', 'Qwen3 4B', 'Qwen/Qwen3-4B'),
    ('qwen3-14b', 'Qwen3 14B', 'Qwen/Qwen3-14B'),
    ('qwen25-7b', 'Qwen 2.5 7B Instruct', 'Qwen/Qwen2.5-7B-Instruct'),
    ('qwen25-coder', 'Qwen 2.5 Coder 7B', 'Qwen/Qwen2.5-Coder-7B-Instruct'),
    ('qwen25-vl', 'Qwen 2.5 VL 7B', 'Qwen/Qwen2.5-VL-7B-Instruct'),
    ('gemma3-4b', 'Gemma 3 4B', 'google/gemma-3-4b-it'),
    ('gemma3-12b', 'Gemma 3 12B', 'google/gemma-3-12b-it'),
    ('gemma2-9b', 'Gemma 2 9B', 'google/gemma-2-9b-it'),
    ('phi4-full', 'Phi-4', 'microsoft/phi-4'),
    ('phi3-mini', 'Phi-3 Mini 4K', 'microsoft/Phi-3-mini-4k-instruct'),
    ('phi35-mini', 'Phi-3.5 Mini', 'microsoft/Phi-3.5-mini-instruct'),
    ('florence2', 'Florence-2 Large', 'microsoft/Florence-2-large'),
    ('mistral7b', 'Mistral 7B Instruct v0.3', 'mistralai/Mistral-7B-Instruct-v0.3'),
    ('mixtral8x7b', 'Mixtral 8x7B Instruct', 'mistralai/Mixtral-8x7B-Instruct-v0.1'),
    ('mistral-nemo', 'Mistral NeMo', 'mistralai/Mistral-Nemo-Instruct-2407'),
    ('smollm2-360m', 'SmolLM2 360M', 'HuggingFaceTB/SmolLM2-360M-Instruct'),
    ('olmo2-32b', 'OLMo 2 32B', 'allenai/OLMo-2-0325-32B-Instruct'),
    ('yi15-34b', 'Yi 1.5 34B', '01-ai/Yi-1.5-34B-Chat'),
    ('aya8b', 'Aya Expanse 8B', 'CohereForAI/aya-expanse-8b'),
    ('aya32b', 'Aya Expanse 32B', 'CohereForAI/aya-expanse-32b'),
    ('sdxl', 'Stable Diffusion XL', 'stabilityai/stable-diffusion-xl-base-1.0'),
    ('flux-dev', 'FLUX.1 Dev', 'black-forest-labs/FLUX.1-dev'),
    ('flux-schnell', 'FLUX.1 Schnell', 'black-forest-labs/FLUX.1-schnell'),
    ('whisper-large', 'Whisper Large v3', 'openai/whisper-large-v3'),
    ('sam-huge', 'Segment Anything ViT-H', 'facebook/sam-vit-huge'),
    ('all-minilm', 'all-MiniLM-L6-v2', 'sentence-transformers/all-MiniLM-L6-v2'),
    ('bloom', 'BLOOM', 'bigscience/bloom'),
    ('sd35-large', 'Stable Diffusion 3.5 Large', 'stabilityai/stable-diffusion-3.5-large'),
]:
    add('AI', slug, name, 'huggingface', model)


def validate(assets):
    counts = Counter(a['position'] for a in assets)
    assert all(counts[p] >= MIN_CHOICES for p in POSITIONS), f'Too few choices: {counts}'
    assert len({a['slug'] for a in assets}) == len(assets), 'Duplicate slug'
    assert len({(a['provider'], a['key']) for a in assets}) == len(assets), 'Duplicate underlying scoring source'
    assert all(2 <= len(a['slug']) <= 40 for a in assets), 'Invalid PostgreSQL asset slug length'
    assert all(a['position'] in POSITIONS for a in assets), 'Unknown position'
    assert all('/' in a['key'] for a in assets if a['provider'] in ('github_repo', 'huggingface'))
    assert all(a['provider'] == 'cisa' and a.get('aliases') for a in assets if a['position'] == 'VULN')
    all_aliases = [alias.casefold() for a in assets if a['position'] == 'VULN' for alias in a['aliases']]
    assert len(all_aliases) == len(set(all_aliases)), 'Duplicate vendor alias'
    return counts


def asset_url(a):
    return {
        'github_repo': lambda: 'https://github.com/' + a['key'],
        'huggingface': lambda: 'https://huggingface.co/' + a['key'],
        'github_language': lambda: 'https://github.com/search?q=' + quote('language:' + a['key'], safe=''),
        'cisa': lambda: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
        'twelvedata': lambda: 'https://www.nasdaq.com/market-activity/stocks/' + a['key'].lower(),
        'gdelt': lambda: 'https://www.gdeltproject.org/',
    }[a['provider']]()


def sql_quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def main():
    counts = validate(ASSETS)
    for a in ASSETS:
        a['source_url'] = asset_url(a)
    (ROOT / 'site/data/assets.json').write_text(json.dumps(ASSETS, indent=2, ensure_ascii=False) + '\n')
    rows = ','.join('\n (' + ','.join(sql_quote(v) for v in
                   (a['slug'], a['name'], a['position'], asset_url(a))) + ')'
                   for a in ASSETS)
    (ROOT / 'supabase/seed.sql').write_text(
        '-- Regenerated using python scripts/build_catalog.py; safe to rerun on an existing v3 installation.\n'
        'insert into public.assets(slug,name,position,source_url) values' + rows + '\n'
        'on conflict (slug) do update set name=excluded.name, position=excluded.position, source_url=excluded.source_url;\n')
    print('Catalog generated:', len(ASSETS), 'assets', ', '.join(f'{p}={counts[p]}' for p in POSITIONS))


if __name__ == '__main__':
    main()
