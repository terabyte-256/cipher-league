#!/usr/bin/env python3
"""Compatibility shortcut for the CISA-only importer."""
from sync_events import ingest_cisa, upsert

if __name__=='__main__':
    upsert('asset_week_scores',ingest_cisa(),'asset_slug,week_start')
