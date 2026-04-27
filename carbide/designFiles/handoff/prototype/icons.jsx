/* global React, ReactDOM */
const { useState, useEffect, useMemo } = React;

const THEMES = [
  { id: "carbide",  name: "Carbide Refined", blurb: "Polished neutral", supports: ["light", "dark"] },
  { id: "cockpit",  name: "IDE Cockpit",     blurb: "Mono, dense, color-coded statusbar", supports: ["light", "dark"] },
  { id: "paper",    name: "Paper Zen",       blurb: "Serif, hairline, generous", supports: ["light", "dark"] },
  { id: "terminal", name: "Terminal Phosphor", blurb: "Mono, amber on black", supports: ["light", "dark"], prefer: "dark" },
];

const DENSITIES = ["compact", "regular", "airy"];
const RADIUS_MAP = { sharp: "0px", default: "6px", soft: "12px" };

// Icon helpers
const Icon = ({ d, size = 16, fill = "none", stroke = "currentColor", sw = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);
const I = {
  files:   <Icon d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>}/>,
  star:    <Icon d={<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>}/>,
  dash:    <Icon d={<><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></>}/>,
  tasks:   <Icon d={<><path d="M3 6l2 2 4-4"/><path d="M3 14l2 2 4-4"/><line x1="13" y1="6" x2="21" y2="6"/><line x1="13" y1="14" x2="21" y2="14"/></>}/>,
  cal:     <Icon d={<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}/>,
  tags:    <Icon d={<><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>}/>,
  graph:   <Icon d={<><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><line x1="6.5" y1="7" x2="11" y2="17"/><line x1="17.5" y1="7" x2="13" y2="17"/></>}/>,
  git:     <Icon d={<><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M6 8v8"/><path d="M18 8a4 4 0 0 1-4 4h-2"/></>}/>,
  help:    <Icon d={<><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></>}/>,
  cog:     <Icon d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>}/>,
  chev:    <Icon d={<polyline points="9 18 15 12 9 6"/>} sw={2}/>,
  chevDown:<Icon d={<polyline points="6 9 12 15 18 9"/>} sw={2}/>,
  doc:     <Icon d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>}/>,
  folder:  <Icon d={<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>}/>,
  x:       <Icon d={<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>} sw={2}/>,
  plus:    <Icon d={<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>} sw={2}/>,
  more:    <Icon d={<><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></>} fill="currentColor" stroke="none"/>,
  search:  <Icon d={<><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>}/>,
  bell:    <Icon d={<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>}/>,
  bolt:    <Icon d={<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>}/>,
  err:     <Icon d={<><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}/>,
};

Object.assign(window, { THEMES, DENSITIES, RADIUS_MAP, I });
