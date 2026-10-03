/* Maquetas NEXARA: iconos de trazo, avatares ilustrados con uniforme, barra lateral compartida y modo oscuro.
   <i data-i="nombre"></i>       → icono SVG 24×24
   <span data-av="Nombre" data-s="32" data-f data-st="on|away|off"></span> → avatar
   <aside class="sb" data-active="id"></aside> → barra lateral
   ?tema=oscuro · ?rail=1 · ?vacio=1 · ?ios=1 */
(function () {
  var P = {
    home: '<path d="m3 10.5 9-7.5 9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    board: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
    task: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8 7.5 9.5 4.4-1.5 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3a6.5 6.5 0 0 1 3.5 5.7"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    quote: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h6M9 16h4"/>',
    folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
    box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="m3 7.5 9 4.5 9-4.5M12 12v9"/>',
    tool: '<path d="M14.5 6.5a4 4 0 0 0 5 5L11 20a2.1 2.1 0 0 1-3-3z"/><path d="M14.5 6.5 17 4"/>',
    truck: '<path d="M2 6h11v10H2zM13 9h5l3 3v4h-8z"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>',
    book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20"/><path d="M8 7h8"/>',
    wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5z"/><path d="M15 12h4"/><path d="M4 8h15"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
    sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="m15 10-2 2 2 2"/>',
    bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    more: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
    morev: '<circle cx="12" cy="5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="19" r="1.3" fill="currentColor"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    cctv: '<path d="M3 7.5 15 4l2 6-12 3.5z"/><path d="m17 10 2.5-.8M7 12.8 8.5 17H5M3 20v-6"/>',
    wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r=".8" fill="currentColor"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3M14 9l2 2"/>',
    hardhat: '<path d="M3 18h18M5 18v-3a7 7 0 0 1 14 0v3"/><path d="M10 8V5h4v3"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    checkc: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    xc: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
    alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    tup: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    tdown: '<path d="m3 7 6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
    pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    phone: '<path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
    nav: '<path d="m3 11 18-8-8 18-2-8z"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4 2v-8.5z"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    kanban: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/>',
    map: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
    sort: '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    logout: '<path d="M10 4H5v16h5"/><path d="M15 8l4 4-4 4M19 12H9"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 16-5-5-8 8"/>',
    file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
    sig: '<path d="M3 17c3 0 4-8 6-8s0 8 3 8 3-4 5-4 2 2 4 2"/><path d="M3 21h18"/>',
    send: '<path d="M21 3 10 14"/><path d="m21 3-7 18-4-7-7-4z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    fp: '<path d="M12 11v3a8 8 0 0 1-1.5 4.5"/><path d="M8.5 6.5A6 6 0 0 1 18 11v2M6 10a6 6 0 0 0 0 1v2a9 9 0 0 0 1 4M15 14a12 12 0 0 1-1 5M9 12a3 3 0 0 1 6-1"/>',
    printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    org: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-2h12v2"/>',
    cmd: '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
    chevrons: '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
    receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>'
  };

  var q = location.search;
  if (/tema=oscuro/.test(q)) document.body.classList.add("dark");
  if (/ios=1/.test(q)) document.body.classList.add("ios");
  if (/vacio=1/.test(q)) document.body.classList.add("vacio");

  /* Barra lateral compartida (grupos de access-matrix: Hoy · Clientes y obra · Recursos · Finanzas · Mi cuenta) */
  var NAV = [
    ["Hoy", [
      ["resumen", "home", "Resumen"],
      ["mias", "task", "Mis actividades", "4"],
      ["pizarra", "board", "Actividades", "12", "brand"],
      ["asistencias", "clock", "Asistencias"],
      ["chat", "chat", "Chat", "3"],
      ["aprobaciones", "shield", "Aprobaciones", "5", "hot"]
    ]],
    ["Clientes y obra", [
      ["clientes", "users", "Clientes"],
      ["cotizaciones", "quote", "Cotizaciones", "7"],
      ["proyectos", "folder", "Proyectos"]
    ]],
    ["Recursos", [
      ["almacen", "box", "Almacén", "", "dot"],
      ["herramientas", "tool", "Herramientas"],
      ["vehiculos", "truck", "Vehículos"]
    ]],
    ["Finanzas", [
      ["contabilidad", "book", "Contabilidad"],
      ["viaticos", "wallet", "Viáticos", "2"],
      ["pagos", "briefcase", "Pagos a personal"]
    ]]
  ];
  document.querySelectorAll("aside.sb[data-active]").forEach(function (sb) {
    var act = sb.getAttribute("data-active");
    var h = '<div class="sb-top"><img class="sb-logo" src="logo.png" alt=""><div><div class="sb-name">NEXARA</div>' +
      '<div class="sb-org">Core · Oficinas Puebla <i data-i="chevrons" class="xs"></i></div></div>' +
      '<a class="sb-collapse" title="Contraer menú"><i data-i="sidebar" class="sm"></i></a></div>' +
      '<div class="sb-search"><i data-i="search" class="sm"></i><span>Buscar o ir a…</span><span class="kbd">Ctrl K</span></div><nav class="sb-nav">';
    NAV.forEach(function (g) {
      h += '<div class="sb-group"><div class="sb-label">' + g[0] + '</div>';
      g[1].forEach(function (it) {
        var extra = "";
        if (it[4] === "dot") extra = '<span class="sb-dot" title="Stock bajo"></span>';
        else if (it[3]) extra = '<span class="sb-count ' + (it[4] || "") + '">' + it[3] + "</span>";
        h += '<a class="sb-item' + (it[0] === act ? " on" : "") + '"><i data-i="' + it[1] + '"></i><span>' + it[2] + "</span>" + extra + "</a>";
      });
      h += "</div>";
    });
    h += '<div class="sb-group"><div class="sb-label">Mi cuenta <i data-i="right" class="xs"></i></div></div>';
    h += '</nav><div class="sb-foot"><div class="sb-shift"><span class="live"></span><span>En jornada · entrada <b>8:02</b></span><span style="margin-left:auto" class="num">6 h 41</span></div>' +
      '<div class="sb-user"><span data-av="Christian Del Pozo" data-s="36" data-st="on"></span><div class="grow"><div class="sb-user-name ellipsis">Christian Del Pozo</div>' +
      '<div class="sb-user-role ellipsis">Director general</div></div><i data-i="chevrons" class="sm" style="color:var(--sb-fg-2)"></i></div></div>';
    sb.innerHTML = h;
  });
  if (/rail=1/.test(q)) {
    document.querySelectorAll(".app").forEach(function (a) { a.classList.add("rail"); });
    var items = document.querySelectorAll(".sb-item");
    if (items[2]) {
      items[2].classList.add("hov");
      items[2].insertAdjacentHTML("beforeend", '<span class="sb-tip">Actividades · 12 abiertas <span class="kbd">G A</span></span>');
    }
  }

  /* Avatares ilustrados: polo negro NEXARA con el punto verde del logotipo */
  var SKIN = ["#f1c6a3", "#e0ac84", "#c98e66", "#a8714c", "#8a5a3c"];
  var HAIR = ["#1f1a17", "#2b211c", "#3d2b22", "#4a3426", "#151515", "#5a4232"];
  var BG = ["#d7efe8", "#dcebf6", "#f3e3f1", "#fbe8d6", "#e6e9f6", "#e3f1dc", "#f6e2e2"];
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  document.querySelectorAll("[data-av]").forEach(function (el) {
    var n = el.getAttribute("data-av"), s = +(el.getAttribute("data-s") || 32), f = el.hasAttribute("data-f"), hh = hash(n);
    var skin = SKIN[hh % SKIN.length], hair = HAIR[(hh >> 3) % HAIR.length], bg = BG[(hh >> 5) % BG.length];
    var hairP = f
      ? '<path d="M12.3 17C11.6 8.3 15.6 5.6 20 5.6s8.4 2.7 7.7 11.4l.9 9.6c-2.4 1-3.7-.6-3.8-3.4l.4-10C23 11 17 11 14.8 13.2l.4 10c-.1 2.8-1.4 4.4-3.8 3.4z" fill="' + hair + '"/>'
      : '<path d="M12.8 15.4C12.6 8.6 16.2 6.4 20 6.4s7.4 2.2 7.2 9c-.9-2.9-3.2-4.6-7.2-4.6s-6.3 1.7-7.2 4.6z" fill="' + hair + '"/>';
    var svg = '<svg class="av" width="' + s + '" height="' + s + '" viewBox="0 0 40 40"><rect width="40" height="40" fill="' + bg + '"/>' +
      '<rect x="16.8" y="21" width="6.4" height="7.5" rx="2.5" fill="' + skin + '" style="filter:brightness(.92)"/>' +
      '<path d="M4 41c0-8.6 7-13.4 16-13.4S36 32.4 36 41z" fill="#141a24"/>' +
      '<path d="M16.2 27.9 20 32.4l3.8-4.5" fill="none" stroke="#3a4352" stroke-width="1.4"/>' +
      '<circle cx="27.6" cy="34" r="1.4" fill="#1f9e84"/>' +
      (f ? hairP : "") +
      '<ellipse cx="20" cy="16.2" rx="6.9" ry="7.8" fill="' + skin + '"/>' +
      (f ? '<path d="M13.4 14.6c.6-4.6 3.3-6.6 6.6-6.6s6 2 6.6 6.6c-2-2.6-4.4-3.5-6.6-3.5s-4.6.9-6.6 3.5z" fill="' + hair + '"/>' : hairP) +
      "</svg>";
    var st = el.getAttribute("data-st");
    var wrap = document.createElement("span");
    wrap.className = "av-wrap";
    wrap.innerHTML = svg + (st ? '<span class="st ' + (st === "on" ? "" : st) + '"></span>' : "");
    wrap.title = n;
    el.replaceWith(wrap);
  });

  document.querySelectorAll("i[data-i]").forEach(function (el) {
    var name = el.getAttribute("data-i");
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "i " + (el.className || ""));
    svg.innerHTML = P[name] || '<circle cx="12" cy="12" r="8"/>';
    if (el.getAttribute("style")) svg.setAttribute("style", el.getAttribute("style"));
    el.replaceWith(svg);
  });
})();
