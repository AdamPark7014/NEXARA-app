/* Iconos de trazo (24×24) para las maquetas. <i data-i="nombre"></i> se sustituye por el SVG. */
(function () {
  var P = {
    hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    pin: '<path d="M12 16v6"/><path d="M9 3h6l-1 6 3 4v3H7v-3l3-4-1-6z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3a6.5 6.5 0 0 1 3.5 5.7"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    belloff: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/><path d="m3 3 18 18"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/>',
    smileplus: '<path d="M20.5 12A8.5 8.5 0 1 1 12 3.5"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/><path d="M19 2v6M16 5h6"/>',
    thread: '<path d="M4 5h16v11H10l-6 4.5z"/>',
    threads: '<path d="M3 4h13v9H8l-5 3.5z"/><path d="M19.5 8H21v9h-3v3l-4-3h-4"/>',
    more: '<circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/>',
    clip: '<path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.8 17.1a1.7 1.7 0 0 1-2.4-2.4L15 7"/>',
    at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
    send: '<path d="M21 3 10 14"/><path d="m21 3-7 18-4-7-7-4z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    ul: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
    ol: '<path d="M10 6h11M10 12h11M10 18h11"/><path d="M4 4.5h1.2V9M3.8 9h2.6M3.8 14.5c.4-1 2.6-.9 2.6.4 0 1.200-2.600 1.800-2.600 3.100h2.600"/>',
    quote: '<path d="M5 5v14"/><path d="M10 8h10M10 12h10M10 16h6"/>',
    code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5"/>',
    codeblock: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 9-3 3 3 3M14 9l3 3-3 3"/>',
    task: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="m9 13 2 2 4-4"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
    filetext: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
    image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 16-5-5-8 8"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    compose: '<path d="M11 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6"/><path d="M18 2.800a2 2 0 0 1 3 3L12.500 14.300 9 15l.700-3.500z"/>',
    home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    checkcircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    checks: '<path d="m2 12.500 4 4L14 8"/><path d="m11.500 16 .500.500L20 8"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    box: '<path d="M3 8 12 3l9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    truck: '<path d="M2 6h11v10H2zM13 9h5l3 3v4h-8z"/><circle cx="6.500" cy="17.500" r="1.800"/><circle cx="17.500" cy="17.500" r="1.800"/>',
    folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
    chart: '<path d="M5 20V11M11 20V4M17 20v-7M2 20h20"/>',
    moon: '<path d="M20 14.500A8 8 0 1 1 9.500 4a6.500 6.500 0 0 0 10.500 10.500z"/>',
    out: '<path d="M9 6h9v9"/><path d="M18 6 7 17"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.500"/>',
    tool: '<path d="M14.500 6.500a4 4 0 0 0 5 5L11 20a2.100 2.100 0 0 1-3-3z"/><path d="M14.500 6.500 17 4"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    logout: '<path d="M10 4H5v16h5"/><path d="M15 8l4 4-4 4M19 12H9"/>',
    aa: '<path d="M3 18 7.500 6 12 18M4.800 14h5.400"/><path d="M20 18v-4.500a2.500 2.500 0 0 0-5 0M20 16a2.500 2.500 0 1 1-2.500-2.500H20"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    check2: '<path d="m4 12 5 5L20 6"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.500 8 8 9 4.500-1 8-4 8-9V6z"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>'
  };
  document.querySelectorAll("i[data-i]").forEach(function (el) {
    var name = el.getAttribute("data-i");
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "i " + (el.className || ""));
    svg.innerHTML = P[name] || "";
    if (el.getAttribute("style")) svg.setAttribute("style", el.getAttribute("style"));
    el.replaceWith(svg);
  });
  if (/tema=oscuro/.test(location.search)) document.body.classList.add("dark");
})();
