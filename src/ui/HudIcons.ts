const paths={
  lantern:'M9 3h6m-5 0v4m4-4v4M7 7h10l2 13H5L7 7Zm2 13v2m6-2v2M12 10v6m-2-3h4',
  map:'m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16',
  sword:'m15 3 6 0v6L10 20l-6-6L15 3ZM7 11l6 6M4 20l3-3',
  hammer:'m13 3 8 8-4 4-4-4-9 10-3-3 10-9-3-3 5-3Z',
  home:'m3 11 9-8 9 8M5 10v11h14V10M10 21v-7h4v7',
  settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
  help:'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4m0 3v.2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z',
  music:'M9 17V5l11-2v12M9 8l11-2M9 17c0 3-6 4-6 1s6-4 6-1Zm11-2c0 3-6 4-6 1s6-4 6-1Z',
  volume:'m3 9 5 0 5-5v16l-5-5H3V9Zm14-2a7 7 0 0 1 0 10m2-13a11 11 0 0 1 0 16',
  mute:'m3 9 5 0 5-5v16l-5-5H3V9Zm14 0 5 6m0-6-5 6',
  leaf:'M20 3C7 2 2 8 5 15s15 4 15-12ZM4 21 16 8m-8 9-1-5m5 1h5',
  spark:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z',
  stone:'m3 17 4-11 9-3 6 11-5 7-14-4Zm4-11 6 10 9-2m-9 2 4 5',
  wood:'m5 19 13-13M3 16l5 5 13-13-5-5L3 16Zm1 0 4 4M10 9l5 5',
  copper:'m12 3 9 6v9l-9 4-9-4V9l9-6Zm-9 6 9 5 9-5m-9 5v8',
  fire:'M13 2c3 6-4 7-1 11 2 2 4-1 4-4 6 7 4 13-4 13-10 0-10-10-5-15 0 5 6 4 6-5Z',
  fist:'M5 12V7a2 2 0 0 1 4 0v4-7a2 2 0 0 1 4 0v7-6a2 2 0 0 1 4 0v6-3a2 2 0 0 1 4 0v7l-5 7H9l-7-8a2 2 0 0 1 3-2Z',
  bag:'M5 7h14l2 14H3L5 7Zm3 0V5a4 4 0 0 1 8 0v2M8 12h8',
  chevron:'m6 9 6 6 6-6',
  pause:'M8 5v14M16 5v14',
  play:'m7 4 14 8-14 8V4Z',
  close:'m6 6 12 12M6 18 18 6'
} as const;
export type HudIcon=keyof typeof paths;
export const icon=(name:HudIcon)=>`<svg class="hud-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
