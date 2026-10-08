/**
 * DataBrowser
 * (c) M. Maahn, 2012-2026
 */

// ============================================================================
// Global Configuration & State Variables
// ============================================================================

var config = {};
var longName = {};
var minDates = {};
var maxDates = {};
var hasDisabled = {};
var dataStrings = {};
var uniNetwork = false;
var cloudnetSiteNames = {};
var cloudnetDataCache = {};
var cloudnetDataCacheTime = {};
var CACHE_TTL_MS = 5 * 60 * 1000;
var cloudnetSiteProducts = {};  // site -> array of product ids that have data (cached)
var cloudnetProductVariables = null;  // cached from /api/products/variables

// ============================================================================
// Global UI & URL State Variables
// ============================================================================

var path = "";
var fileNames = "dataBrowser";
var ext = ".html";
var dPick;
var uriNew;

// ============================================================================
// Configuration Initialization
// ============================================================================

fetch('config.json')
  .then(response => response.json())
  .then(data => {
    config = data;
    populateGlobalConfig(data);
    initializePage();
  })
  .catch(error => {
    console.error('Error loading configuration:', error);
    initializePage();
  });

function populateGlobalConfig(data) {
  for (const [siteKey, siteData] of Object.entries(data.sites)) {
    longName[siteKey] = siteData.longName;
    minDates[siteKey] = siteData.minDate;
    maxDates[siteKey] = siteData.maxDate;
    hasDisabled[siteKey] = siteData.hasDisabled;
    dataStrings[siteKey] = siteData.dataStrings;
    cloudnetSiteNames[siteKey] = siteData.cloudnetSiteName || "";
  }
}

// ============================================================================
// Cloudnet Data Fetching (with cache)
// ============================================================================

/**
 * Fetches all Cloudnet product variables once on startup and caches them.
 * Calls onReady when done (or immediately if already cached).
 */
function loadCloudnetProductVariables(onReady) {
  if (cloudnetProductVariables !== null) {
    onReady(cloudnetProductVariables);
    return;
  }
  $.ajax({
    url: "getCloudnetProducts.php",  // proxy, same as getCloudnetData.php pattern
    dataType: 'json',
    success: function (data) {
      cloudnetProductVariables = data;
      onReady(data);
    },
    error: function () {
      console.error("Failed to load Cloudnet product variables");
      cloudnetProductVariables = [];  // empty so we don't retry forever
      onReady([]);
    }
  });
}

/**
 * Removes Cloudnet options for products the site has never had data for.
 * Runs asynchronously after the dropdowns are filled (the first probe per site takes a moment),
 * so URL-restored panels load immediately; currently selected options are always kept.
 * If the product list cannot be fetched, all options stay.
 */
function pruneCloudnetOptions(site) {
  var apply = function (available) {
    if ($("#selectSite").val() !== site) return;  // user already moved on
    $("select.select option[data-product]").each(function () {
      var option = $(this);
      if (available.indexOf(option.attr("data-product")) === -1 && !option.prop("selected")) option.remove();
    });
  };
  if (cloudnetSiteProducts[site]) { apply(cloudnetSiteProducts[site]); return; }
  $.ajax({
    url: "getCloudnetSiteProducts.php?site=" + encodeURIComponent(cloudnetSiteNames[site]),
    dataType: 'json',
    success: function (available) {
      cloudnetSiteProducts[site] = available;
      apply(available);
    }
  });
}

function getCloudnetData(cloudnetSiteName, formattedDate, callback, errorCallback) {
  var cacheKey = cloudnetSiteName + "_" + formattedDate;
  var today = $.datepicker.formatDate('yy-mm-dd', new Date());
  var isToday = (formattedDate === today);
  var isFresh = cloudnetDataCacheTime[cacheKey] &&
    (Date.now() - cloudnetDataCacheTime[cacheKey] < CACHE_TTL_MS);

  if (cloudnetDataCache[cacheKey] && (!isToday || isFresh)) {
    callback(cloudnetDataCache[cacheKey]);
    return;
  }

  var apiUrl = "getCloudnetData.php?site=" + encodeURIComponent(cloudnetSiteName) +
    "&date=" + encodeURIComponent(formattedDate);

  $.ajax({
    url: apiUrl,
    dataType: 'json',
    success: function (data) {
      cloudnetDataCache[cacheKey] = data;
      cloudnetDataCacheTime[cacheKey] = Date.now();
      callback(data);
    },
    error: function (jqXHR, textStatus, errorThrown) {
      console.error("Failed to load Cloudnet data for " + cloudnetSiteName +
        " on " + formattedDate + ":", textStatus, errorThrown);
      if (errorCallback) errorCallback();
    }
  });
}

// ============================================================================
// Date helpers
// ============================================================================

/**
 * Returns true if dateParam is a pure integer string like "0", "-1", "1"
 */
function isRelativeDateParam(dateParam) {
  return /^-?\d+$/.test(String(dateParam).trim());
}

/**
 * Resolves a date parameter to an absolute "yyyy-mm-dd" string.
 * Handles relative offsets (0 = today, -1 = yesterday) and absolute date strings.
 */
function resolveDateParam(dateParam) {
  if (isRelativeDateParam(dateParam)) {
    var d = new Date();
    d.setDate(d.getDate() + parseInt(dateParam));
    return $.datepicker.formatDate('yy-mm-dd', d);
  }
  return dateParam;
}

/**
 * Resolves a minDate/maxDate config value for the jQuery UI datepicker.
 * Strings are passed through as-is ("2021-09-01").
 * Integers are passed through as-is (0 = today, -1 = yesterday) since
 * jQuery UI datepicker natively understands integer day offsets.
 */
function resolveDatePickerBound(value) {
  if (value === null || value === undefined || value === "") return null;
  // If it's already a number (from JSON: "maxDate": 0) pass it directly
  if (typeof value === 'number') return value;
  // If it's a string that is a pure integer, convert to number
  if (isRelativeDateParam(value)) return parseInt(value);
  // Otherwise it's an absolute date string
  return value;
}

function resolveDateForPicker(rawDate) {
  if (isRelativeDateParam(rawDate)) {
    // jQuery UI datepicker treats setDate(0) as falsy and ignores it,
    // so always resolve relative dates to an actual Date object
    var d = new Date();
    d.setDate(d.getDate() + parseInt(rawDate));
    return d;  // Date object, never falsy
  }
  return rawDate;  // absolute string like "2026-06-24"
}

// ============================================================================
// Main Initialization
// ============================================================================

function initializePage() {
  if (typeof yourIp !== 'undefined' &&
    (yourIp.startsWith("139.18") || yourIp.startsWith("134.95") || yourIp.startsWith("131.220"))) {
    uniNetwork = true;
  }

  var url = new URL(document.URL);
  var urlNoPanels = url.searchParams.get('noPanels');
  if (urlNoPanels && !isNaN(parseInt(urlNoPanels))) {
    noPanels = parseInt(urlNoPanels);
  } else if (typeof noPanels === 'undefined') {
    noPanels = 1;
  }
  $("#noOfPanels").val(noPanels);

  setupDatepicker();
  setupNavigationButtons();
  setupPermalinkDialog();
  populateSiteSelect();
  setupImageErrorHandlers();
  setupChangeListeners();
  setupKeyBindings();
  setupPanelButton();
  setupDialogModal();

  // Load product variables first, then handle URL params
  // For sites without Cloudnet this resolves immediately from cache ([])
  loadCloudnetProductVariables(function () {
    handleUrlParameters(url);
  });
}

// ============================================================================
// UI Setup & Event Handlers
// ============================================================================


function refreshSelectsForDate(formattedDate) {
  var saved = {};
  ["UpperLeft", "UpperRight", "LowerRight", "LowerLeft", "UpperCenter", "LowerCenter"].forEach(function (panel) {
    saved[panel] = $("#select" + panel).val();
  });

  // populateSelect is now synchronous — no onReady needed
  populateSelect(function () {
    ["UpperLeft", "UpperRight", "LowerRight", "LowerLeft", "UpperCenter", "LowerCenter"].forEach(function (panel, index) {
      if (index === 0 || noPanels > index) {
        selectPanelValue(panel, saved[panel]);
      }
    });
    setImages();
  });
}

/**
 * Selects a value in a panel's dropdown; falls back to "Select:" (empty panel)
 * if the current site has no such product, instead of leaving the select blank.
 */
function selectPanelValue(panel, value) {
  var select = $("#select" + panel);
  select.val(value);
  if (select.val() === null) select.val("default");
}

function setupDatepicker() {
  dPick = $("#datepicker_date").datepicker({
    changeMonth: true,
    changeYear: true,
    onSelect: function () {
      var formattedDate = $("#datepicker_date").val();
      refreshSelectsForDate(formattedDate);
    },
    dateFormat: "yy-mm-dd",
    firstDay: 1
  });
}

function setupNavigationButtons() {
  $("#datepicker_prev").on("click", function () {
    var currentDate = dPick.datepicker("getDate") || new Date();
    currentDate.setDate(currentDate.getDate() - 1);
    dPick.datepicker("setDate", currentDate);
    refreshSelectsForDate($.datepicker.formatDate('yy-mm-dd', currentDate));
  });

  $("#datepicker_next").on("click", function () {
    var currentDate = dPick.datepicker("getDate") || new Date();
    currentDate.setDate(currentDate.getDate() + 1);
    dPick.datepicker("setDate", currentDate);
    refreshSelectsForDate($.datepicker.formatDate('yy-mm-dd', currentDate));
  });
}

function setupKeyBindings() {
  $(document).on("keyup.databrowser", function (e) {
    if ($(e.target).is("input, select, textarea") || e.ctrlKey || e.metaKey || e.altKey) return;
    var currentDate = dPick.datepicker("getDate");
    if (!currentDate) return;
    if (e.key === "a") {
      currentDate.setDate(currentDate.getDate() - 1);
      dPick.datepicker("setDate", currentDate);
      refreshSelectsForDate($.datepicker.formatDate('yy-mm-dd', currentDate));
    } else if (e.key === "s") {
      currentDate.setDate(currentDate.getDate() + 1);
      dPick.datepicker("setDate", currentDate);
      refreshSelectsForDate($.datepicker.formatDate('yy-mm-dd', currentDate));
    }
  });
}

function setupPermalinkDialog() {
  $("#dialog-modal-select").on("change", function () {
    uriNew = createUrl($(this).val());
    $("#dialog-modal-url").text(uriNew).attr("href", uriNew);
  });

  $("#permalink").on("click", function () {
    var currentDateStr = $("#datepicker_date").val();
    $("#dialog-modal-extraDate").text(currentDateStr).val(currentDateStr);
    uriNew = createUrl($("#dialog-modal-select").val());
    $("#dialog-modal-url").text(uriNew).attr("href", uriNew);
    $("#dialog-modal").dialog("open");
  });
}

function populateSiteSelect() {
  var fragment = document.createDocumentFragment();
  $.each(longName, function (key, value) {
    var option = new Option(value, key);
    fragment.appendChild(option);
  });
  $("#selectSite").append(fragment);
}

function handleUrlParameters(url) {
  // searchParams.get() already percent-decodes; decoding again would corrupt or throw on '%'
  var urlSite = url.searchParams.get('site');
  if (urlSite && longName.hasOwnProperty(urlSite)) {
    $("#selectSite").val(urlSite);

    // Apply datepicker bounds first, before setting any date
    var site = $("#selectSite").val();
    dPick.datepicker("option", "minDate", resolveDatePickerBound(minDates[site]));
    dPick.datepicker("option", "maxDate", resolveDatePickerBound(maxDates[site]));

    var rawDate = url.searchParams.get('date') || "-1";  // default: yesterday
    var resolvedDate = resolveDateParam(rawDate);
    var dateForPicker = resolveDateForPicker(rawDate);

    var panelParams = {};
    ["UpperLeft", "UpperRight", "LowerRight", "LowerLeft", "UpperCenter", "LowerCenter"].forEach(function (panel) {
      var val = url.searchParams.get(panel);
      val = (val && val !== "undefined") ? val : "default";
      panelParams[panel] = val;
    });

    // Set the date on the datepicker NOW, before the async fetch,
    // so getDate() returns a valid date when setImages() is called
    dPick.datepicker("setDate", dateForPicker);

    populateSelect(function () {
      ["UpperLeft", "UpperRight", "LowerRight", "LowerLeft", "UpperCenter", "LowerCenter"].forEach(function (panel, index) {
        if (index === 0 || noPanels > index) {
          selectPanelValue(panel, panelParams[panel]);
        }
      });
      // Date is already set — just load images
      setImages();
    });

  } else {
    var site = $("#selectSite").val();
    if (site) {
      dPick.datepicker("option", "minDate", resolveDatePickerBound(minDates[site]));
      dPick.datepicker("option", "maxDate", resolveDatePickerBound(maxDates[site]));
    }
    var yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    dPick.datepicker("setDate", yesterday);
    populateSelect(function () {
      // nothing to load, no panels selected
      updateAddressBar();
    });
  }
}

function setupImageErrorHandlers() {
  var panelIds = ["UpperLeft", "UpperRight", "LowerLeft", "LowerRight", "LowerCenter", "UpperCenter"];
  panelIds.forEach(function (loc) {
    $("#" + loc + "Data").on("error.databrowser", function () {
      // Replacing the src avoids the browser's broken-image icon; guard against looping on default.gif
      if (/default\.gif$/.test($(this).attr("src") || "")) return;
      var date = dPick.datepicker("getDate");
      var site = $("#selectSite").val();
      var key = $("#select" + loc).val();
      var failedSrc = $(this).attr("src");
      clearPanel(loc);
      $("#" + loc + "Error")
        .text("No data and/or plot available for " + $("#datepicker_date").val())
        .css("margin", "100px")
        // link to the URL that failed, for debugging
        .append($("<div>").append($('<a target="_blank" rel="noopener">').attr("href", failedSrc).text("requested file")));
      showAdjacent(loc, site, key, date);
    });
  });
}

// ============================================================================
// Next available image (non-Cloudnet): parses directory listings via PHP proxy
// ============================================================================

var listingCache = {};
var EARLIER_SEARCH_DAYS = 120;

/** Calls cb(arrayOfNames) (empty if the directory does not exist) or cb(null) if listings are unavailable. */
function getDirectoryListing(prefix, cb) {
  if (prefix in listingCache) { cb(listingCache[prefix]); return; }
  $.ajax({
    url: "getDirectoryListing.php?url=" + encodeURIComponent(prefix),
    dataType: 'json',
    success: function (names) { listingCache[prefix] = names; cb(names); },
    error: function (xhr) {
      // 404 = the directory does not exist (treated as empty); anything else = listing unavailable
      listingCache[prefix] = (xhr.status === 404) ? [] : null;
      cb(listingCache[prefix]);
    }
  });
}

/**
 * Finds the nearest date from startDate in direction dir (+1 later, -1 earlier), up to limitDate,
 * for which the image exists,
 * by comparing the URL the format yields with the directory listing one level up
 * from the first path segment that changes with the date.
 * Calls cb(Date) if found, cb(null) if none found, cb(undefined) if listings are unavailable.
 */
function findAdjacentImageDate(format, startDate, dir, limitDate, cb) {
  var dayMs = 86400000;
  var maxDays = Math.floor(dir * (new Date(limitDate.getFullYear(), limitDate.getMonth(), limitDate.getDate()) -
    new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())) / dayMs);

  function candidate(n) {
    var d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + dir * n);
    return { date: d, parts: $.datepicker.formatDate(format, d).trim().split('/') };
  }

  // Reference pair within one month, so that only the day-level segment differs first
  var ref = new Date(startDate.getFullYear(), startDate.getMonth(), 15);
  var a = $.datepicker.formatDate(format, ref).trim().split('/');
  var b = $.datepicker.formatDate(format, new Date(ref.getFullYear(), ref.getMonth(), 16)).trim().split('/');
  var i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (i >= a.length || i < 3) { cb(undefined); return; }  // no date-dependent path segment

  var anyListing = false;
  var n = 1;

  function prefixOf(c) { return c.parts.slice(0, i).join('/') + '/'; }

  function step() {
    if (n > maxDays) { cb(anyListing ? null : undefined); return; }
    var c = candidate(n);
    var prefix = prefixOf(c);
    getDirectoryListing(prefix, function (names) {
      if (names === null) { cb(undefined); return; }
      anyListing = true;
      var entries = {};
      names.forEach(function (name) { entries[name.replace(/\/$/, '')] = true; });
      // Dates in this directory whose entry exists; verify them in parallel chunks (earliest hit wins)
      var found = [];
      while (n <= maxDays) {
        var cc = candidate(n);
        if (prefixOf(cc) !== prefix) break;
        if (entries[cc.parts[i]]) found.push(cc);
        n++;
      }
      verifyChunks(found, 0);
    });
  }

  function verifyChunks(found, start) {
    if (start >= found.length) { step(); return; }
    var chunk = found.slice(start, start + 8);
    var results = [];
    var pending = chunk.length;
    chunk.forEach(function (c, idx) {
      // the entry may be a directory (e.g. a day folder): check the remaining segments down to the file
      verify(c, i + 1, function (ok) {
        results[idx] = ok;
        if (--pending > 0) return;
        var hit = results.indexOf(true);
        if (hit >= 0) cb(chunk[hit].date); else verifyChunks(found, start + 8);
      });
    });
  }

  function verify(c, level, done) {
    if (level >= c.parts.length) { done(true); return; }
    getDirectoryListing(c.parts.slice(0, level).join('/') + '/', function (names) {
      if (!names) { done(false); return; }
      var found = names.some(function (name) { return name.replace(/\/$/, '') === c.parts[level]; });
      if (!found) { done(false); return; }
      verify(c, level + 1, done);
    });
  }
  step();
}

/** Lower search bound for earlier images: the site's configured minDate. */
function siteMinDate(site) {
  var min = resolveDatePickerBound(minDates[site]);
  if (typeof min === 'number') return resolveDateForPicker(min);
  try { return $.datepicker.parseDate('yy-mm-dd', min); } catch (e) { return new Date(2000, 0, 1); }
}

function parseS3KeyDate(s3key) {
  return new Date(+s3key.substr(0, 4), +s3key.substr(4, 2) - 1, +s3key.substr(6, 2));
}

/**
 * Cloudnet: asks the API for all visualizations of this product in the search window
 * and returns the nearest one on either side (the date is the s3key's yyyymmdd prefix).
 */
function findAdjacentCloudnetDate(cloudnetSiteName, productId, date, dir, cb) {
  var fmt = function (d) { return $.datepicker.formatDate('yy-mm-dd', d); };
  var day = function (n) { return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n); };
  var from = dir > 0 ? day(1) : day(-365);  // earlier images: look back one year
  var to = dir > 0 ? new Date() : day(-1);
  if (fmt(from) > fmt(to)) { cb(null); return; }

  $.ajax({
    url: "getCloudnetData.php?site=" + encodeURIComponent(cloudnetSiteName) +
      "&dateFrom=" + fmt(from) + "&dateTo=" + fmt(to) + "&variable=" + encodeURIComponent(productId),
    dataType: 'json',
    success: function (data) {
      var best = null;
      data.forEach(function (entry) {
        entry.visualizations.forEach(function (v) {
          if (v.productVariable.id !== productId) return;
          var k = v.s3key.substr(0, 8);
          if (best === null || (dir > 0 ? k < best : k > best)) best = k;
        });
      });
      cb(best && parseS3KeyDate(best));
    },
    error: function () { cb(undefined); }  // no hint on failure
  });
}

/** Adds the two (initially empty) "previous"/"next" hint lines to a panel's message box. */
function addAdjacentSlots(loc) {
  var box = $("#" + loc + "Error");
  box.append($('<div class="adjacent adjacent-prev">'), $('<div class="adjacent adjacent-next">'));
}

/** Fills a hint line: next = Date, null = nothing found, undefined = unknown (leave empty). */
function fillAdjacentSlot(loc, dir, next) {
  if (next === undefined) return;
  var slot = $("#" + loc + "Error .adjacent-" + (dir > 0 ? "next" : "prev"));
  if (!next) {
    slot.text(dir > 0 ? "No later image found." : "No earlier image found nearby.");
    return;
  }
  var nextStr = $.datepicker.formatDate('yy-mm-dd', next);
  var link = $('<a href="#">').text(nextStr).on("click", function (e) {
    e.preventDefault();
    dPick.datepicker("setDate", next);
    refreshSelectsForDate(nextStr);
  });
  slot.text(dir > 0 ? "Next available image: " : "Previous available image: ").append(link);
}

/** True if the panel/site/date shown is still the one a hint search was started for. */
function isStillCurrent(loc, site, key, date) {
  var current = dPick.datepicker("getDate");
  return $("#select" + loc).val() === key && $("#selectSite").val() === site &&
    current && current.getTime() === date.getTime();
}

/** Shows links to the previous and next available image for a missing image. */
function showAdjacent(loc, site, key, date) {
  if (!date || !key || key === "default") return;
  var search;
  if (key.indexOf("cloudnet_") === 0) {
    var cloudnetSiteName = cloudnetSiteNames[site];
    if (!cloudnetSiteName) return;
    var productId = key.replace("cloudnet_", "");
    search = function (dir, cb) { findAdjacentCloudnetDate(cloudnetSiteName, productId, date, dir, cb); };
  } else {
    var format = dataStrings[site] && dataStrings[site][key];
    if (!format || format === "disabled") return;
    search = function (dir, cb) {
      // Earlier images: look back at most EARLIER_SEARCH_DAYS (every directory costs a request)
      var limit = new Date();
      if (dir < 0) {
        var floor = new Date(date.getFullYear(), date.getMonth(), date.getDate() - EARLIER_SEARCH_DAYS);
        var min = siteMinDate(site);
        limit = min > floor ? min : floor;
      }
      findAdjacentImageDate(format, date, dir, limit, cb);
    };
  }

  addAdjacentSlots(loc);
  [-1, 1].forEach(function (dir) {
    search(dir, function (found) {
      if (isStillCurrent(loc, site, key, date)) fillAdjacentSlot(loc, dir, found);
    });
  });
}

function setupChangeListeners() {
  $("select.select").on("change", function () {
    setImages();
  });

  $("#selectSite").on("change", function () {
    var site = $(this).val();
    dPick.datepicker("option", "minDate", resolveDatePickerBound(minDates[site]));
    dPick.datepicker("option", "maxDate", resolveDatePickerBound(maxDates[site]));
    var currentDate = dPick.datepicker("getDate");
    var formattedDate = currentDate
      ? $.datepicker.formatDate('yy-mm-dd', currentDate)
      : $.datepicker.formatDate('yy-mm-dd', new Date());
    refreshSelectsForDate(formattedDate);
  });
}


function setupPanelButton() {
  $("#noOfPanels").on("change", function () {
    noPanels = parseInt($(this).val());
    location.href = buildPanelUrl(noPanels);
  });
}

function setupDialogModal() {
  $("#dialog-modal").dialog({
    height: 300,
    width: 700,
    modal: true,
    autoOpen: false,
    buttons: [
      {
        text: "Ok",
        click: function () { $(this).dialog("close"); }
      }
    ]
  });
}

// ============================================================================
// Core Functionality: Images & URLs
// ============================================================================

function setImages() {
  var site = $("#selectSite").val();
  var date = dPick.datepicker("getDate");
  if (!date) return;  // datepicker not set yet

  ["UpperLeft", "UpperRight", "LowerRight", "LowerLeft", "UpperCenter", "LowerCenter"].forEach(function (panel, index) {
    if (index === 0 || noPanels > index) {
      setOneImage(panel, date, site);
    }
  });

  setNoOfPanelButton();
  updateAddressBar();
}

/**
 * Mirrors the current state (site, date, panel selections) into the address bar
 * without adding history entries, so reloading or bookmarking restores the view.
 */
function updateAddressBar() {
  try {
    var target = new URL(createUrl($("#datepicker_date").val()));
    history.replaceState(null, "", target.pathname + target.search);
  } catch (e) {
    // e.g. file:// origins reject replaceState; the address bar is just a convenience
  }
}

/**
 * Clears a panel's image and error message, ready for a new load.
 */
function clearPanel(loc) {
  $("#" + loc + "Data").attr({ src: "default.gif", title: "" });
  $("#" + loc + "Error").text("").css("margin", "");
  $("#" + loc + "Link").attr("href", "#").removeAttr("target");
}

function setOneImage(loc, date, site) {
  var dataStringKey = $("#select" + loc).val();

  if (!dataStringKey || dataStringKey === "default") {
    clearPanel(loc);
    $("#" + loc + "Error").text("Please select data source");
    return;
  }

  if (dataStringKey.startsWith("cloudnet_")) {
    var cloudnetSiteName = cloudnetSiteNames[site];
    if (!cloudnetSiteName) {
      $("#" + loc + "Error").text("No Cloudnet site configured for " + site);
      return;
    }

    var formattedDate = $.datepicker.formatDate('yy-mm-dd', date);
    var productId = dataStringKey.replace("cloudnet_", "");

    // Clear stale image immediately before async fetch
    clearPanel(loc);

    // Ignore responses that arrive after the user changed the panel, site or date
    var isStale = function () {
      var current = dPick.datepicker("getDate");
      return $("#select" + loc).val() !== dataStringKey ||
        $("#selectSite").val() !== site ||
        !current || $.datepicker.formatDate('yy-mm-dd', current) !== formattedDate;
    };

    getCloudnetData(cloudnetSiteName, formattedDate, function (cloudnetData) {
      if (isStale()) return;
      var visualization = null;
      outer: for (var i = 0; i < cloudnetData.length; i++) {
        for (var j = 0; j < cloudnetData[i].visualizations.length; j++) {
          if (cloudnetData[i].visualizations[j].productVariable.id === productId) {
            visualization = cloudnetData[i].visualizations[j];
            break outer;
          }
        }
      }

      if (visualization) {
        var imageUrl = "https://cloudnet.fmi.fi/api/download/image/" + visualization.s3key;
        $("#" + loc + "Data").attr({ src: imageUrl, title: imageUrl });
        $("#" + loc + "Error").text("").css("margin", "");
        $("#" + loc + "Link").attr({ href: imageUrl, target: "_blank" });
      } else {
        $("#" + loc + "Error").text("No Cloudnet data available for " + dataStringKey + " on " + formattedDate);
        showAdjacent(loc, site, dataStringKey, date);
      }
    }, function () {
      if (isStale()) return;
      $("#" + loc + "Error").text("Failed to load Cloudnet data");
    });

  } else {
    var dataString = dataStrings[site][dataStringKey];
    var fileSrc = $.datepicker.formatDate(dataString, date);
    $("#" + loc + "Data").attr({ src: fileSrc, title: fileSrc });
    $("#" + loc + "Error").text("").css("margin", "");
    $("#" + loc + "Link").attr({ href: fileSrc, target: "_blank" });
  }
}

/** Current selection of a panel; "default" if empty (e.g. option missing at the new site). */
function panelValue(panel) {
  return $("#select" + panel).val() || "default";
}

function createUrl(date) {
  var url = new URL(window.location.href);
  var newUrl = new URL(buildBaseUrl() + url.pathname);

  newUrl.searchParams.set('site', panelValue("Site"));
  newUrl.searchParams.set('date', date);
  newUrl.searchParams.set('UpperLeft', panelValue("UpperLeft"));
  addPanelQueryParams(newUrl);

  return newUrl.toString();
}

function buildBaseUrl() {
  return new URL(window.location.href).origin;
}

function buildPanelUrl(panelCount) {
  var currentUrl = new URL(window.location.href);
  var dir = currentUrl.pathname.replace(/[^/]+$/, '');
  var newUrl = new URL(currentUrl.origin + dir + fileNames + panelCount + ext);

  newUrl.searchParams.set('site', panelValue("Site"));
  newUrl.searchParams.set('date', $("#datepicker_date").val());

  ["UpperLeft", "UpperRight", "LowerRight", "LowerLeft", "UpperCenter", "LowerCenter"].forEach(function (panel, index) {
    var select = $("#select" + panel);
    var val = (select.length > 0 && select.val() && select.val() !== "undefined")
      ? select.val()
      : "default";
    if (index === 0 || panelCount > index) {
      newUrl.searchParams.set(panel, val);
    }
  });

  return newUrl.toString();
}

function addPanelQueryParams(url) {
  if (noPanels > 1) url.searchParams.set('UpperRight', panelValue("UpperRight"));
  if (noPanels > 2) url.searchParams.set('LowerRight', panelValue("LowerRight"));
  if (noPanels > 3) url.searchParams.set('LowerLeft', panelValue("LowerLeft"));
  if (noPanels > 4) url.searchParams.set('UpperCenter', panelValue("UpperCenter"));
  if (noPanels > 5) url.searchParams.set('LowerCenter', panelValue("LowerCenter"));
}

function setNoOfPanelButton() {
  uriNew = buildPanelUrl(noPanels);
}

function populateSelect(onReady) {
  // Note: dateStr parameter removed — dropdown no longer depends on date
  var site = $("#selectSite").val();
  $("select.select").html('<option value="default">Select:</option>');

  var fragment = document.createDocumentFragment();
  $.each(dataStrings[site], function (key, value) {
    var option = new Option(key, key);
    if (value === "disabled") option.disabled = true;
    fragment.appendChild(option);
  });
  $("select.select").append(fragment);

  var cloudnetSiteName = cloudnetSiteNames[site];
  if (cloudnetSiteName && cloudnetProductVariables) {
    var cloudnetFragment = document.createDocumentFragment();
    var seen = {};
    cloudnetProductVariables.forEach(function (product) {
      // Use product humanReadableName as instrument label for derived products,
      // since /api/products/variables has no instrument info
      var instrumentLabel = product.humanReadableName;
      product.variables.forEach(function (variable) {
        var productKey = "cloudnet_" + variable.id;
        if (!seen[productKey]) {
          seen[productKey] = true;
          var label = (instrumentLabel === variable.humanReadableName)
            ? "Cloudnet: " + instrumentLabel
            : "Cloudnet: " + instrumentLabel + " \u2013 " + variable.humanReadableName;
          var option = new Option(label, productKey);
          option.setAttribute("data-product", product.id);
          cloudnetFragment.appendChild(option);
        }
      });
    });
    $("select.select").append(cloudnetFragment);
    pruneCloudnetOptions(site);
  }

  if (!uniNetwork && hasDisabled[site]) {
    var opt = new Option("Some instruments are only accessible from the network of the University!", "disabled");
    opt.disabled = true;
    $("select.select").append(opt);
  }

  if (typeof onReady === 'function') onReady();
}