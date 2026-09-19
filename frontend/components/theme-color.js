"use client";

import { useEffect } from "react";

/* ----------------------------------------------------------------------------
   Retint the status bar for one page.

   `theme-color` is what Android Chrome paints the status bar and toolbar with,
   and what an installed app uses for the area around the notch. It is a
   document-level value, but the pages in this app do not share a background:
   the signed-in shell opens on a white header, while the landing hero and the
   auth brand strip open on navy. One value for the whole document means whichever
   wins leaves a seam — a white band above a navy hero, or a navy band above
   every white app header.

   So the layout declares the common case (white, five of six destinations) and
   these three pages borrow the tag while they are mounted, handing it back on
   the way out. React 19 would hoist a second `<meta>` into the head and leave
   two of them fighting, which browsers resolve by taking the first — hence
   mutating the existing tag rather than rendering another.
   -------------------------------------------------------------------------- */
export default function ThemeColor({ color }) {
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;

    const previous = meta.getAttribute("content");
    meta.setAttribute("content", color);
    return () => {
      if (previous !== null) meta.setAttribute("content", previous);
    };
  }, [color]);

  return null;
}
