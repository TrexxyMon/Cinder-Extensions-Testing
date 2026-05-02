var GoComics = {};

GoComics.id = "gocomics";
GoComics.name = "GoComics";
GoComics.version = "1.2.0-cinderfix";
GoComics.icon = "GC";
GoComics.description =
  "Read daily comic strips from GoComics.com - patched for Cinder.";
GoComics.contentType = "manga";

GoComics.capabilities = {
  search: true,
  discover: true,
  download: false,
  resolve: false,
  manga: true,
};

GoComics.BASE_URL = "https://www.gocomics.com";

GoComics.COMICS = [
  { id: "1-and-done", title: "1 and Done" },
  { id: "9chickweedlane", title: "9 Chickweed Lane" },
  { id: "adamathome", title: "Adam@Home" },
  { id: "agnes", title: "Agnes" },
  { id: "alley-oop", title: "Alley Oop" },
  { id: "andycapp", title: "Andy Capp" },
  { id: "animal-crackers", title: "Animal Crackers" },
  { id: "annie", title: "Annie" },
  { id: "archie", title: "Archie" },
  { id: "arctic-circle", title: "Arctic Circle" },
  { id: "arlo-and-janis", title: "Arlo and Janis" },
  { id: "ask-shagg", title: "Ask Shagg" },
  { id: "baby-blues", title: "Baby Blues" },
  { id: "ballard-street", title: "Ballard Street" },
  { id: "barkeater-lake", title: "Barkeater Lake" },
  { id: "barney-google-and-snuffy-smith", title: "Barney Google and Snuffy Smith" },
  { id: "basicinstructions", title: "Basic Instructions" },
  { id: "bc", title: "B.C." },
  { id: "beatles", title: "The Beatles" },
  { id: "beetle-bailey", title: "Beetle Bailey" },
  { id: "big-nate", title: "Big Nate" },
  { id: "bignate-classics", title: "Big Nate Classics" },
  { id: "bill-rechin", title: "Bill Rechin" },
  { id: "birdbrains", title: "Birdbrains" },
  { id: "bizarro", title: "Bizarro" },
  { id: "bliss", title: "Bliss" },
  { id: "blondie", title: "Blondie" },
  { id: "bloomcounty", title: "Bloom County" },
  { id: "boondocks", title: "The Boondocks" },
  { id: "bound-and-gagged", title: "Bound and Gagged" },
  { id: "brevity", title: "Brevity" },
  { id: "broomhilda", title: "Broomhilda" },
  { id: "buckles", title: "Buckles" },
  { id: "calvinandhobbes", title: "Calvin and Hobbes" },
  { id: "candorville", title: "Candorville" },
  { id: "cats-with-hands", title: "Cats With Hands" },
  { id: "cathy", title: "Cathy" },
  { id: "cathy-classics", title: "Cathy Classics" },
  { id: "chuckle-bros", title: "Chuckle Bros" },
  { id: "citizen-dog", title: "Citizen Dog" },
  { id: "classic-peanuts", title: "Classic Peanuts" },
  { id: "cleats", title: "Cleats" },
  { id: "close-to-home", title: "Close to Home" },
  { id: "committed", title: "Committed" },
  { id: "complexity", title: "Complexity" },
  { id: "cornered", title: "Cornered" },
  { id: "crankshaft", title: "Crankshaft" },
  { id: "crock", title: "Crock" },
  { id: "cx", title: "CX" },
  { id: "dadcando-family-fun-stuff", title: "Dadcando Family Fun Stuff" },
  { id: "danthe", title: "Dan the Man" },
  { id: "darrin-bell", title: "Darrin Bell" },
  { id: "dat", title: "Dat" },
  { id: "deflocked", title: "Deflocked" },
  { id: "dennis-the-menace", title: "Dennis the Menace" },
  { id: "dethbert", title: "Dethbert" },
  { id: "dick-tracy", title: "Dick Tracy" },
  { id: "dill", title: "Dill" },
  { id: "dilbert-classics", title: "Dilbert Classics" },
  { id: "doodles", title: "Doodles" },
  { id: "doonesbury", title: "Doonesbury" },
  { id: "drabble", title: "Drabble" },
  { id: "dustin", title: "Dustin" },
  { id: "edge-city", title: "Edge City" },
  { id: "elderberries", title: "Elderberries" },
  { id: "eligible-bachelor", title: "Eligible Bachelor" },
  { id: "ernie", title: "Ernie" },
  { id: "f-minus", title: "F Minus" },
  { id: "family-circus", title: "The Family Circus" },
  { id: "fastrack", title: "Fastrack" },
  { id: "flo-and-friends", title: "Flo & Friends" },
  { id: "forbetter", title: "For Better or For Worse" },
  { id: "foxtrot", title: "FoxTrot" },
  { id: "foxtrot-classics", title: "FoxTrot Classics" },
  { id: "frank-and-ernest", title: "Frank and Ernest" },
  { id: "free-range", title: "Free Range" },
  { id: "frog-applause", title: "Frog Applause" },
  { id: "garfield", title: "Garfield" },
  { id: "garfield-classics", title: "Garfield Classics" },
  { id: "gasoline-alley", title: "Gasoline Alley" },
  { id: "get-fuzzy", title: "Get Fuzzy" },
  { id: "gil-thorp", title: "Gil Thorp" },
  { id: "ginger-meggs", title: "Ginger Meggs" },
  { id: "grizzwells", title: "The Grizzwells" },
  { id: "hagar-the-horrible", title: "Hagar the Horrible" },
  { id: "heathcliff", title: "Heathcliff" },
  { id: "herb-and-jamaal", title: "Herb and Jamaal" },
  { id: "herman", title: "Herman" },
  { id: "herzblock", title: "Herblock" },
  { id: "hiandlois", title: "Hi and Lois" },
  { id: "hobbes-and-bacon", title: "Hobbes and Bacon" },
  { id: "home-and-away", title: "Home and Away" },
  { id: "housed", title: "Housed" },
  { id: "hubris", title: "Hubris!" },
  { id: "hummingbird", title: "Hummingbird" },
  { id: "humor-me-by-lori-busk", title: "Humor Me" },
  { id: "in-the-bleachers", title: "In the Bleachers" },
  { id: "ink-pen", title: "Ink Pen" },
  { id: "inspector-danger-crime-quiz", title: "Inspector Danger's Crime Quiz" },
  { id: "jane-s-world", title: "Jane's World" },
  { id: "jef-mallett", title: "Jef Mallett" },
  { id: "jim-benton-cartoons", title: "Jim Benton Cartoons" },
  { id: "jump-start", title: "JumpStart" },
  { id: "kit-n-carlyle", title: "Kit N' Carlyle" },
  { id: "la-cucaracha", title: "La Cucaracha" },
  { id: "lasagna-cat", title: "Lasagna Cat" },
  { id: "lil-abner", title: "Li'l Abner" },
  { id: "liography", title: "Liography" },
  { id: "lola", title: "Lola" },
  { id: "luann", title: "Luann" },
  { id: "luann-againn", title: "Luann Againn" },
  { id: "marmaduke", title: "Marmaduke" },
  { id: "mary-worth", title: "Mary Worth" },
  { id: "max-and-jackie", title: "Max and Jackie" },
  { id: "moose-and-molly", title: "Moose and Molly" },
  { id: "mother-goose-and-grimm", title: "Mother Goose & Grimm" },
  { id: "motley", title: "Motley" },
  { id: "motleyclassics", title: "Motley Classics" },
  { id: "mutts", title: "Mutts" },
  { id: "nancy", title: "Nancy" },
  { id: "nancy-classics", title: "Nancy Classics" },
  { id: "nate-and-friends", title: "Nate and Friends" },
  { id: "new-adventures-of-queen-victoria", title: "The New Adventures of Queen Victoria" },
  { id: "non-sequitur", title: "Non Sequitur" },
  { id: "norm-feuti", title: "Norm Feuti" },
  { id: "off-the-mark", title: "Off the Mark" },
  { id: "on-a-claire-day", title: "On A Claire Day" },
  { id: "one-big-happy", title: "One Big Happy" },
  { id: "over-the-hedge", title: "Over the Hedge" },
  { id: "peanuts", title: "Peanuts" },
  { id: "pearls-before-swine", title: "Pearls Before Swine" },
  { id: "pickles", title: "Pickles" },
  { id: "pirate-mike", title: "Pirate Mike" },
  { id: "pooch-cafe", title: "Pooch Cafe" },
  { id: "potato-and-the-look", title: "Potato and the Look" },
  { id: "prince-valiant", title: "Prince Valiant" },
  { id: "real-life-adventures", title: "Real Life Adventures" },
  { id: "red-and-rover", title: "Red and Rover" },
  { id: "reply-all", title: "Reply All" },
  { id: "retail", title: "Retail" },
  { id: "rex-morgan-md", title: "Rex Morgan, M.D." },
  { id: "rhymes-with-orange", title: "Rhymes with Orange" },
  { id: "richard-s-poor-almanac", title: "Richard's Poor Almanac" },
  { id: "ripley-s-believe-it-or-not", title: "Ripley's Believe It or Not!" },
  { id: "rose-is-rose", title: "Rose is Rose" },
  { id: "rubes", title: "Rubes" },
  { id: "rudy-park", title: "Rudy Park" },
  { id: "rumpus", title: "Rumpus" },
  { id: "sally-forth", title: "Sally Forth" },
  { id: "sam-and-silo", title: "Sam and Silo" },
  { id: "scary-gary", title: "Scary Gary" },
  { id: "shoe", title: "Shoe" },
  { id: "shoecollection", title: "Shoe Classics" },
  { id: "six-chix", title: "Six Chix" },
  { id: "skull-duggery", title: "Skull Duggery" },
  { id: "small-world", title: "Small World" },
  { id: "slylock-fox", title: "Slylock Fox and Comics for Kids" },
  { id: "snuffy-smith", title: "Snuffy Smith" },
  { id: "soup-to-nutz", title: "Soup to Nutz" },
  { id: "speed-bump", title: "Speed Bump" },
  { id: "spiderman", title: "The Amazing Spider-Man" },
  { id: "spot-the-frog", title: "Spot the Frog" },
  { id: "stanley", title: "Stanley" },
  { id: "state-of-the-union", title: "State of the Union" },
  { id: "steve-breen", title: "Steve Breen" },
  { id: "stone-soup", title: "Stone Soup" },
  { id: "stone-soup-classics", title: "Stone Soup Classics" },
  { id: "strip-fix", title: "Strip Fix" },
  { id: "striptease", title: "Striptease" },
  { id: "sunnyside", title: "Sunnyside" },
  { id: "swamp", title: "Swamp" },
  { id: "tank-mcnamara", title: "Tank McNamara" },
  { id: "tarzan", title: "Tarzan" },
  { id: "the-barn", title: "The Barn" },
  { id: "the-buckets", title: "The Buckets" },
  { id: "the-dinette-set", title: "The Dinette Set" },
  { id: "the-duplex", title: "The Duplex" },
  { id: "the-norm-classics", title: "The Norm Classics" },
  { id: "the-other-coast", title: "The Other Coast" },
  { id: "thimble-theater", title: "Thimble Theater" },
  { id: "think-again", title: "Think Again" },
  { id: "todays-dogg", title: "Today's Dogg" },
  { id: "tomversation", title: "Tomversation" },
  { id: "toothpaste-for-dinner", title: "Toothpaste for Dinner" },
  { id: "tough-town", title: "Tough Town" },
  { id: "u-s-acres", title: "U.S. Acres" },
  { id: "wee-pals", title: "Wee Pals" },
  { id: "wizard-of-id", title: "Wizard of Id" },
  { id: "wizard-of-id-classics", title: "Wizard of Id Classics" },
  { id: "working-daze", title: "Working Daze" },
  { id: "working-it-out", title: "Working It Out" },
  { id: "wrong-hands", title: "Wrong Hands" },
  { id: "xkcd", title: "xkcd" },
  { id: "yin", title: "Yin" },
  { id: "ziggy", title: "Ziggy" },
  { id: "zits", title: "Zits" },
  { id: "zits-classics", title: "Zits Classics" }
];

GoComics._match = function(html, patternStr, flags, fallback) {
  var re = new RegExp(patternStr, flags || "i");
  var m = re.exec(html || "");
  return m ? (m[1] || "").trim() : (fallback || "");
};

GoComics._decode = function(str) {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\\u0026/g, "&");
};

GoComics._getDaysBack = async function() {
  var stored = await cinder.store.get("days_back");
  var parsed = parseInt(stored || "30", 10);
  return parsed > 0 ? parsed : 30;
};

GoComics._headers = async function() {
  var token0 = await cinder.secureStore.get("session_token_0");
  var token1 = await cinder.secureStore.get("session_token_1");
  var cookieParts = [];
  if (token0) cookieParts.push("__Secure-next-auth.session-token.0=" + token0);
  if (token1) cookieParts.push("__Secure-next-auth.session-token.1=" + token1);

  var headers = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.gocomics.com/"
  };

  if (cookieParts.length > 0) {
    headers.Cookie = cookieParts.join("; ");
  }
  return headers;
};

GoComics._comicToResult = function(c) {
  return {
    id: c.id,
    title: c.title,
    url: this.BASE_URL + "/" + c.id,
    format: "manga"
  };
};

GoComics._extractLatestPublishedDate = function(html) {
  var re = /"datePublished"\s*:\s*"([A-Za-z]+ \d{1,2}, \d{4})"/g;
  var match;
  var latest = null;
  while ((match = re.exec(html || "")) !== null) {
    var parsed = new Date(match[1]);
    if (!isNaN(parsed.getTime()) && (!latest || parsed.getTime() > latest.getTime())) {
      latest = parsed;
    }
  }
  return latest;
};

GoComics._monthKey = function(date) {
  return date.getFullYear() + "/" + String(date.getMonth() + 1).padStart(2, "0");
};

GoComics._fetchMonthCalendar = async function(slug, monthKey) {
  var headers = await this._headers();
  var url = this.BASE_URL + "/calendar/" + slug + "/" + monthKey;
  var res = await cinder.fetch(url, {
    headers: headers,
    timeout: 8000
  });
  if (!res || res.status !== 200 || !res.data) {
    throw new Error("Calendar request failed for " + monthKey);
  }
  var parsed = JSON.parse(res.data);
  if (!parsed || !parsed.length) {
    return [];
  }
  return parsed;
};

GoComics._optimizeImageUrl = function(url, width) {
  if (!url) return "";
  if (url.indexOf("featureassets.gocomics.com") === -1) return url;
  var targetWidth = width || 1200;
  if (url.indexOf("?") === -1) {
    return url + "?optimizer=image&width=" + targetWidth + "&quality=85";
  }
  if (url.indexOf("width=") >= 0) {
    return url.replace(/width=\d+/i, "width=" + targetWidth);
  }
  if (url.indexOf("optimizer=image") >= 0) {
    return url + "&width=" + targetWidth + "&quality=85";
  }
  return url;
};

GoComics.search = async function(query, page) {
  var q = (query || "").toLowerCase().trim();
  var filtered = this.COMICS.filter(function(c) {
    return c.title.toLowerCase().indexOf(q) >= 0 || c.id.toLowerCase().indexOf(q) >= 0;
  });
  return filtered.slice(0, 20).map(this._comicToResult.bind(this));
};

GoComics.getDiscoverSections = async function() {
  return [
    { id: "popular", title: "Popular Comics", icon: "star" },
    { id: "atoz", title: "All Comics A-Z", icon: "list" }
  ];
};

GoComics.getDiscoverItems = async function(sectionId, page) {
  var popular = [
    "peanuts", "garfield", "calvinandhobbes", "pickles", "pearls-before-swine",
    "baby-blues", "zits", "blondie", "beetle-bailey", "family-circus",
    "hagar-the-horrible", "non-sequitur", "marmaduke", "mutts", "doonesbury",
    "foxtrot", "drabble", "luann", "mary-worth", "sally-forth"
  ];
  var list;
  var p = page || 0;

  if (sectionId === "popular") {
    list = popular
      .map(function(id) {
        return GoComics.COMICS.find(function(c) { return c.id === id; });
      })
      .filter(Boolean);
  } else {
    var start = p * 20;
    list = this.COMICS.slice(start, start + 20);
  }

  return list.map(this._comicToResult.bind(this));
};

GoComics.getMangaDetails = async function(slug) {
  var headers = await this._headers();
  var res = await cinder.fetch(this.BASE_URL + "/" + slug, { headers: headers });

  var title = slug;
  var description = "Daily comic strip from GoComics.";
  var cover = "https://avatar.gocomics.com/" + slug + "/avatar_256.jpg";
  var author = "";

  var local = this.COMICS.find(function(c) { return c.id === slug; });
  if (local) title = local.title;

  if (res.status === 200) {
    var html = res.data || "";

    var ogTitle = this._match(html, 'og:title"\\s+content="([^"]+)"', "i");
    if (ogTitle) title = this._decode(ogTitle.replace(/ [-|:].*$/, "").trim());

    var ogDesc = this._match(html, 'og:description"\\s+content="([^"]+)"', "i");
    if (ogDesc) description = this._decode(ogDesc);

    var ogImage = this._match(html, 'og:image"\\s+content="([^"]+)"', "i");
    if (ogImage) cover = this._optimizeImageUrl(ogImage, 512);

    var stripImage = this._extractImageUrl(html);
    if (stripImage) cover = this._optimizeImageUrl(stripImage, 512);

    var ldAuthor = this._match(html, '"author"\\s*:\\s*\\{[^}]*"name"\\s*:\\s*"([^"]+)"', "i");
    if (ldAuthor) author = this._decode(ldAuthor);
  }

  return {
    id: slug,
    title: title,
    cover: cover,
    description: description,
    author: author || undefined,
    status: "ongoing",
    genres: ["Comic Strip"]
  };
};

GoComics.getChapters = async function(slug) {
  var daysBack = await this._getDaysBack();
  var cacheKey = "calendar_cache_" + slug + "_" + daysBack;
  try {
    var cached = await cinder.store.get(cacheKey);
    if (cached) {
      var cachedObj = JSON.parse(cached);
      if (cachedObj && cachedObj.fetchedAt && Array.isArray(cachedObj.chapters)) {
        if (Date.now() - cachedObj.fetchedAt < 12 * 60 * 60 * 1000) {
          return cachedObj.chapters;
        }
      }
    }
  } catch (e) {}

  var latestAvailable = null;
  var headers = await this._headers();
  var landing = await cinder.fetch(this.BASE_URL + "/" + slug, { headers: headers });
  if (landing && landing.status === 200 && landing.data) {
    latestAvailable = this._extractLatestPublishedDate(landing.data);
  }
  if (!latestAvailable) {
    try {
      var browserLanding = await cinder.fetchBrowser(this.BASE_URL + "/" + slug);
      latestAvailable = this._extractLatestPublishedDate(browserLanding.data || "");
    } catch (e) {}
  }
  var today = latestAvailable || new Date();
  var seen = {};
  var allDates = [];
  var cursor = new Date(today.getFullYear(), today.getMonth(), 1);
  var monthAttempts = Math.max(2, Math.ceil(daysBack / 26) + 2);
  var m;

  for (m = 0; m < monthAttempts && allDates.length < daysBack; m++) {
    var monthKey = this._monthKey(cursor);
    try {
      var monthDates = await this._fetchMonthCalendar(slug, monthKey);
      var j;
      for (j = 0; j < monthDates.length; j++) {
        var dateStr = monthDates[j];
        if (!dateStr || seen[dateStr]) continue;
        seen[dateStr] = true;
        var parsed = new Date(dateStr.replace(/\//g, "-") + "T00:00:00");
        if (!isNaN(parsed.getTime()) && parsed.getTime() <= today.getTime()) {
          allDates.push(dateStr);
        }
      }
    } catch (e) {
      cinder.warn("Calendar fetch failed for " + slug + " month " + monthKey + ": " + e);
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
  }

  allDates.sort(function(a, b) {
    return new Date(b.replace(/\//g, "-")).getTime() - new Date(a.replace(/\//g, "-")).getTime();
  });

  var dates = allDates.slice(0, daysBack);
  if (dates.length === 0) {
    cinder.warn("Calendar lookup returned no dates for " + slug + ", falling back to guessed recent days.");
    var fallback = [];
    var i;
    for (i = 0; i < daysBack; i++) {
      var d = new Date(today);
      d.setDate(today.getDate() - i);
      var year = d.getFullYear();
      var month = String(d.getMonth() + 1).padStart(2, "0");
      var day = String(d.getDate()).padStart(2, "0");
      var fallbackDate = year + "/" + month + "/" + day;
      fallback.push({
        id: slug + "|" + fallbackDate,
        title: d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric"
        }),
        chapterNumber: daysBack - i,
        dateUploaded: d.toISOString().split("T")[0]
      });
    }
    return fallback;
  }

  var chapters = dates.map(function(dateStr, idx) {
    var parsed = new Date(dateStr.replace(/\//g, "-") + "T00:00:00");
    return {
      id: slug + "|" + dateStr,
      title: parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      }),
      chapterNumber: dates.length - idx,
      dateUploaded: parsed.toISOString().split("T")[0]
    };
  });

  try {
    await cinder.store.set(cacheKey, JSON.stringify({
      fetchedAt: Date.now(),
      chapters: chapters
    }));
  } catch (e) {}

  return chapters;
};

GoComics._extractImageUrl = function(html) {
  var patterns = [
    '"contentUrl":"(https://featureassets\\.gocomics\\.com/assets/[^"?]+)',
    '"url":"(https://featureassets\\.gocomics\\.com/assets/[^"?]+)',
    'src="(https://featureassets\\.gocomics\\.com/assets/[^"?]+)',
    'srcset="(https://featureassets\\.gocomics\\.com/assets/[^"?]+)',
    'og:image"\\s+content="(https://featureassets\\.gocomics\\.com/[^"]+)"'
  ];
  var i;
  for (i = 0; i < patterns.length; i++) {
    var match = this._match(html, patterns[i], "i");
    if (match) return match;
  }
  return "";
};

GoComics.getPages = async function(chapterId) {
  var parts = (chapterId || "").split("|");
  if (parts.length !== 2) throw new Error("Invalid chapter ID: " + chapterId);

  var slug = parts[0];
  var dateStr = parts[1];
  var url = this.BASE_URL + "/" + slug + "/" + dateStr;
  var headers = await this._headers();

  var res = await cinder.fetch(url, { headers: headers });
  var html = (res && res.data) || "";

  if (!html || html.indexOf("Establishing a secure connection") >= 0 || html.indexOf("featureassets.gocomics.com") === -1) {
    res = await cinder.fetchBrowser(url);
    html = (res && res.data) || "";
  }

  if (!html) {
    throw new Error("Failed to load strip page for " + url);
  }

  if (html.indexOf("Establishing a secure connection") >= 0) {
    throw new Error("GoComics returned a security challenge instead of the comic page.");
  }

  if (html.indexOf("This page could not be found") >= 0 || html.indexOf(">404<") >= 0) {
    throw new Error("No strip was published for this date.");
  }

  var imageUrl = this._extractImageUrl(html);
  if (!imageUrl) {
    cinder.error("No strip image found for " + slug + " on " + dateStr);
    throw new Error("No strip image found for " + slug + " on " + dateStr);
  }

  return [{ url: this._optimizeImageUrl(imageUrl, 1400), headers: headers }];
};

GoComics.getSettings = function() {
  return [
    {
      id: "session_token_0",
      label: "Session Token (part 0)",
      type: "password",
      defaultValue: ""
    },
    {
      id: "session_token_1",
      label: "Session Token (part 1)",
      type: "password",
      defaultValue: ""
    },
      {
        id: "days_back",
        label: "Days of History to Load",
        type: "select",
        defaultValue: "14",
        options: [
          { label: "7 days", value: "7" },
          { label: "14 days", value: "14" },
          { label: "30 days", value: "30" },
          { label: "60 days", value: "60" },
          { label: "90 days", value: "90" },
          { label: "180 days", value: "180" },
          { label: "365 days", value: "365" }
        ]
      }
  ];
};

__cinderExport = GoComics;
