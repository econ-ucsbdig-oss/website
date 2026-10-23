/*
  DIG website content
  -------------------
  This is the one file to edit when people, pitches, or numbers change.
  Keep the commas and quotes as they are. Leave a field as "" if you don't have it yet.

  Photos: put the image in assets/img/people/ and set photo: "assets/img/people/first-last.jpg".
  Without a photo, the site shows the person's initials.
*/

window.DIG = {

  // ── Headline numbers (update each quarter) ────────────────────────────
  stats: {
    aum: 829863,                 // dollars
    asOf: "Oct 21, 2026",
    founded: 2021,
    term: "Fall 2026",
    sectorTeams: 6,
  },

  // ── Students ─────────────────────────────────────────────────────────
  // "Manager", or "Analyst"
  // photo: leave "" to show an empty headshot frame.
  students: [
    { name: "Ava Summers", year: "'27", sector: "", photo: "", linkedin: "" },
    { name: "Sarah He", year: "'27", sector: "", photo: "", linkedin: "" },
    { name: "Saloni Singhal", year: "'27", sector: "", photo: "", linkedin: "" },
    { name: "Quinn Baltazar", year: "'27", sector: "", photo: "", linkedin: "" },
    { name: "Aidan Middleton", year: "'27", sector: "", photo: "", linkedin: "" },
    { name: "Victor Silverman", year: "'27", sector: "", photo: "", linkedin: "" },
    { name: "Arman Farzadram", year: "'27", sector: "", photo: "", linkedin: "" },
    { name: "Zachary Rogers", year: "'28", sector: "", photo: "", linkedin: "" },
    { name: "Shriaan Alshriaan", year: "'26", sector: "", photo: "", linkedin: "" },
    { name: "Dawn Suh", year: "'27", sector: "", photo: "", linkedin: "" },
    { name: "Vincent Gumbs", year: "'27", sector: "", photo: "", linkedin: "" },
    { name: "Skylar Schroth", year: "'27", sector: "", photo: "", linkedin: "" },
    { name: "Piper Pickford", year: "'27", sector: "", photo: "", linkedin: "" },
    { name: "Benson Young", year: "'28", sector: "", photo: "", linkedin: "" },
    { name: "Lizzy Stanley", year: "'28", sector: "", photo: "", linkedin: "" },
    { name: "Maxine Park", year: "'28", sector: "", photo: "", linkedin: "" },
    { name: "Sasha Anderson", year: "'28", sector: "", photo: "", linkedin: "" },
    { name: "Emma Bosco", year: "'28", sector: "", photo: "", linkedin: "" },
    { name: "Ashton Laczkowski", year: "'28", sector: "", photo: "", linkedin: "" },
    { name: "Weber Maisel", year: "'28", sector: "", photo: "", linkedin: "" },
    { name: "Sidney Haycocks", year: "'29", sector: "", photo: "", linkedin: "" },
    { name: "Madigan Escobar", year: "'29", sector: "", photo: "", linkedin: "" },
  ],

  // ── Advisory board ───────────────────────────────────────────────────
  // ucsb: UCSB class year, used for the "four decades of Gauchos" line.
  // photo: path to a headshot, or "" for an empty frame.
  // bio: list of paragraphs (from econ.ucsb.edu/programs/careers/SIP-DIG).
  board: [
    { name: "Marc Ackerman",     title: "Senior Financial Advisor", company: "Wells Fargo Advisors", ucsb: 1994, education: "B.A. Communication Studies, UCSB '94", photo: "assets/img/people/marc-ackerman.jpg",
      bio: ["Mr. Ackerman is Senior Financial Advisor of Wells Fargo Advisors, LLC. For over 18 years, he has been advising company founders, entrepreneurs, executives, corporations, foundations, and multi-generational high net worth families. He is part of Wells Fargo Advisors Retirement Plan Advisor Program which is reserved specifically for advisors who have demonstrated extensive experience in helping businesses design, build, administer, and review corporate retirement plans. He is also a member of the Investments & Wealth Institute. Mr. Ackerman previously served as Senior Vice President and Senior Investment Management Consultant at Morgan Stanley Smith Barney for five years.", "A graduate of UC Santa Barbara in 1994, Mr. Ackerman holds a B.A. in Communication Studies.", "Mr. Ackerman is the Chairman of the Board of Hope Heals and he serves on the Board of Directors for both The Los Angeles Fire Department Foundation and Chrysalis. He volunteers as a mentor to foster youth and is a former executive board member of the mentoring organization, Impacting Hearts. Mr. Ackerman regularly speaks about financial planning and stewardship at churches, conferences, and the USC Cecil Murray Center Faith Leaders Institute."] },
    { name: "Kelsey Carter",     title: "Vice President of Strategy", company: "Infravision", ucsb: null, education: "MBA, Harvard Business School · B.A., UCSB", photo: "",
      bio: [] },
    { name: "Robert Kahn",       title: "CEO & Chief Investment Officer", company: "Alpha Next", ucsb: null, education: "MBA, Cornell · B.A., UCSB", photo: "assets/img/people/robert-kahn.jpg",
      bio: ["Mr. Kahn is currently the CEO & Chief Investment Officer of Alpha Next, an Investment advisory, based out of Los Angeles. Prior to his current role, Robert was an investment advisor and portfolio manager at Alpha Analytics Investment Group, serving high net worth individuals, families, and institutions. He also served as senior vice president and senior investment manager at Wells Fargo Bank for high net worth clients, trusts, and institutions on the fiduciary Investment Management and Trust platform.", "While at Wells Fargo, Robert created, implemented, and managed customized investment strategies using individual stocks, bonds, mutual funds, and alternative assets. Prior to Wells Fargo, he served as a senior director and team trader for Portfolio Management at BNY/Mellon Financial Corporation. Robert was also a principal, senior vice president, and equity portfolio manager at Financial Management Advisors, $1.9 billion multi asset management firm. At FMA, Robert managed equity portfolios while leading a team of sector-specific equity analysts. He began his career as an analyst at Schroder Investment Services. He has also received a Masters of Business Administration (MBA) from Cornell."] },
    { name: "Mitchell Kauffman", title: "Managing Director", company: "Kauffman Wealth Management", ucsb: 1977, education: "MBA, Claremont · B.A. Business Economics & B.S. Political Science, UCSB '77", photo: "assets/img/people/mitchell-kauffman.jpg",
      bio: ["Mr. Kauffman graduated from UC Santa Barbara in 1977 with a dual Business Economics and Political Science. He went on to earn an MBA from the Drucker Center at Claremont University, followed by a Certification in Financial Planning (CFP), and Masters of Science in Wealth Management from the College of Financial Planning. After over 35 years building, managing, and then selling his own independent advisory firm, Kauffman Wealth Management Inc., Mr. Kauffman is thrilled over returning to UCSB to share his professional experience with students.", "The undergraduate courses he created and offers include: Ethical Investing to Impact Social Change (RS 190EI), Wall St. Ethics (RS 190WE), and Have Ethics Gone Awry? (RS 190GA). In addition, Mr. Kauffman conducts several courses within the Strategic Investment Program: Exchange Traded Funds & Portfolio Construction (Econ x499.10), Impact Investing (Econ x499.12) and Financial Crises & Business Cycles (Econ x499.11).", "Mr. Kauffman resides in Santa Barbara with his family and is an avid alpine skier."] },
    { name: "Erin Lubitz",       title: "Director and Head of Asset Owner Programming", company: "Milken Institute", ucsb: 2018, education: "B.A. Political Science & Communication, UCSB '18", photo: "assets/img/people/erin-lubitz.jpg",
      bio: ["Erin Lubitz is Director and Head of Asset Owner Programming at the Milken Institute. She leads Institute initiatives such as the Global Capital Markets Advisory Council (GCMAC) and the Rising Allocators, a program she launched to engage the emerging pipeline of future investment leaders from pensions, sovereign wealth funds, endowments and foundations, state treasurers, and corporate treasuries on macroeconomic trends and the future of capital markets.", "Previously, as Senior Associate of Business and Program Development, she oversaw fundraising strategy and relationships with the strategic partners and sponsors of the Institute's major convenings, including its flagship Global Conference. She began her career in public policy, promoting international trade missions within the U.S. Department of Commerce and managing constituent relations in the U.S. House of Representatives."] },
    { name: "Allie Pedersen",    title: "Consultant", company: "Bain & Company", ucsb: 2015, education: "MBA, Columbia Business School · B.A. Economics & Global Studies, UCSB '15", photo: "",
      bio: [] },
    { name: "Rod Scherba",       title: "Executive Managing Director", company: "Newmark", ucsb: 1979, education: "B.A. Business Economics, UCSB '79", photo: "assets/img/people/rod-scherba.jpg",
      bio: ["Mr. Scherba graduated from UCSB in 1979 with a B.A. in Business Economics. He is retired from a 34 year career in Commercial Real Estate. Before retiring he was one of the top broker/advisors in Silicon Valley representing technology companies and landlords in the valley including Facebook, LinkedIn, Uber, and Stanford University amongst many other companies and landlords. Mr. Scherba currently spends his time with his wife and two adult children (when they’re not too busy), teaching and advising UCSB econ students, biking, skiing, surfing, paddle boarding, golfing, hiking, traveling, and playing the guitar with his classic rock band."] },
    { name: "George Tharakan",   title: "Co-Founder & Chief Investment Officer", company: "Alamar Capital", ucsb: null, education: "MBA, UCLA '97 · M.S. Computer Engineering, Illinois '92", photo: "assets/img/people/george-tharakan.jpg",
      bio: ["Mr. Tharakan is the co-founder and chief investment officer of Alamar Capital Management, a private wealth management firm in Santa Barbara. Prior to becoming an investor, he was an engineer at Intel Corporation where he designed microprocessors. Mr. Tharakan is currently the Co-Chair of the CFA Institute - Santa Barbara Chapter and a member of the Santa Barbara Angel Alliance, a group that assists & invests in entrepreneurs in Santa Barbara.", "Mr. Tharakan graduated from the Indian Institute of Technology (IIT) as the top student in his department, obtained an M.S. in Computer Engineering from the University of Illinois, and received an MBA in Finance, with Honors, from the Anderson School of Business (UCLA)."] },
    { name: "Mike Trovato",      title: "Director, Western Region", company: "Wellington Management", ucsb: 1995, education: "MBA, USC Marshall '04 · B.A. Business Economics, UCSB '95", photo: "assets/img/people/mike-trovato.jpg",
      bio: ["Mr. Trovato is the Director of the Western Region at Wellington Management. Prior to joining Wellington, Mr. Trovato was PIMCO’s executive vice president in the London office and the head of product management in Europe, the Middle East, and Africa (EMEA). Previously, he was the head of the EMEA sub-advisory and UK multinational bank business within the global wealth management group. He has also held roles as a credit product manager in EMEA and as an institutional account manager based in Newport Beach.", "A graduate of UC Santa Barbara in 1995, Mr. Trovato holds a B.A. in Business Economics. He then went on to earn an M.B.A. from the Marshall School of Business at the University of Southern California and has over 20 years of investment experience."] },
    { name: "Blake Warner",      title: "Managing Director & Founder", company: "Silicon Valley Partners", ucsb: 1990, education: "B.A. Business Economics & Political Science, UCSB '90 · MBA, USC Marshall '94", photo: "assets/img/people/blake-warner.jpg",
      bio: ["Mr. Warner is the Managing Director and Founder of Silicon Valley Partners, an investment banking boutique focused on technology, media and telecommunications sectors. The firm seeks to advise clients on mergers and acquisitions, carve-outs, strategic sales, secondary private offerings, capital raising, strategic alliances and corporate joint ventures. Mr. Warner actively advises Board and C-level executives on strategic initiatives, including mergers & acquisitions transactions, long-term strategy, subsidiary divestitures and strategic placements.", "In addition to his B.A. from UCSB, Mr. Warner also has an MBA from USC Marshall School of Business (1994). Prior to starting Silicon Valley Partners, Mr. Warner worked as the Vice President of Finance at Bank of America Securities from 1994 to 1999 and was a Managing Director at Thomas Weisel Partners from 1999 to 2009."] },
    { name: "Jeff Youngman",     title: "Director of Private Equity", company: "UC Office of the Chief Investment Officer", ucsb: 2007, education: "B.A. History, UCSB '07", photo: "assets/img/people/jeff-youngman.jpg",
      bio: ["Mr. Youngman graduated from UC Santa Barbara with a degree in History, and a minor in Sports Management, in 2007. He later pursued a Master’s degree in Business Administration. Mr. Youngman is currently an Investment Officer with the University of California Office of the Chief Investment Officer, where he is a member of the public equity team responsible for managing over $70bn in assets on behalf of the Endowment and Pension for the University of California, a position he has held since 2018. His prior roles in the investment industry include being an Investment Officer at the Contra Costa County Employees’ Retirement Association where he oversaw public markets and risk, a member of the institutional exchange traded funds strategy group at BlackRock, and an investment consultant to large institutional investors with Milliman. He began his investment career in Santa Barbara with an internship at (what was then) Smith Barney.", "Mr. Youngman is based in the Bay Area. In 2017 he was named one of the “40 Under Forty” by the Chief Investment Officer Magazine ai-CIO, and was presented the “Emerging Leader” award by the Institutional Investor Institute."] },
  ],

  faculty: {
    name: "Jason Valdez",
    title: "Faculty Advisor",
    subtitle: "Former Managing Director and Global Head of Equity Sales and Trading, Penserra Securities",
    education: "B.A. Business Economics, UCSB '92",
    photo: "assets/img/people/jason-valdez.jpg",
    link: "",
    bio: [
      "Mr. Valdez serves as a Board Member and Investment Practitioner for UCSB's Dean's Investment Group (DIG), leading investment education, guiding portfolio decisions, and mentoring students in a program managing approximately $1 million. He brings 30 years of experience in institutional trading, business development, and operational leadership, including nearly 15 years as a founding partner, Managing Director, and Global Head of Equity Sales and Trading at Penserra Securities. Although retired from the day-to-day demands of running a trading desk, he brings that experience to consulting for FinTech firms, with expertise spanning quantitative trading, market structure, business strategy, growth, and operational efficiency.",
      "Through DIG, Mr. Valdez connects investment theory with real-world markets, emphasizing disciplined research, portfolio construction, risk management, and thoughtful investment decisions. He develops and delivers the investment curriculum, helps establish portfolio governance standards, and supports students' professional growth through coaching, industry connections, and career preparation. His approach emphasizes curiosity, intellectual honesty, and accountability, preparing students to become thoughtful investors and effective finance professionals.",
    ],
  },

  // Email used for every "contact" link on the site.
  contactEmail: "econ-ucsbdig@ucsb.edu",

  // ── Portfolio (copied from Sifter's fund page data; refresh each quarter) ──
  portfolio: {
    asOf: "Oct 21, 2026",
    benchmark: "S&P 500",
    returns: [
      { period: "3 months", fund: 4.3,  bench: 4.2 },
      { period: "6 months", fund: 7.1,  bench: 7.8 },
      { period: "Year to date", fund: 14.8, bench: 12.5 },
      { period: "1 year", fund: 16.3, bench: 14.4 },
    ],
    risk: [
      { label: "Annualized volatility", value: "15.0%" },
      { label: "Beta", value: "1.11" },
      { label: "Sharpe ratio", value: "0.79" },
      { label: "Tracking error", value: "4.3%" },
      { label: "Maximum drawdown", value: "-9.9%" },
    ],
    sectors: [
      { name: "S&P 500 index fund", pct: 46.9 },
      { name: "Technology & Communication", pct: 26.9 },
      { name: "Financials", pct: 9.9 },
      { name: "Consumer", pct: 9.8 },
      { name: "Industrials & Materials", pct: 2.5 },
      { name: "Healthcare", pct: 2.3 },
      { name: "Cash", pct: 1.6 },
    ],
    holdings: [
      { ticker: "VOO",   name: "Vanguard S&P 500 ETF", sector: "Index fund", pct: 46.9 },
      { ticker: "TSM",   name: "Taiwan Semiconductor", sector: "Technology", pct: 7.2 },
      { ticker: "MSFT",  name: "Microsoft", sector: "Technology", pct: 6.0 },
      { ticker: "GOOGL", name: "Alphabet", sector: "Communication", pct: 5.8 },
      { ticker: "ASML",  name: "ASML Holding", sector: "Technology", pct: 4.8 },
      { ticker: "AMZN",  name: "Amazon", sector: "Consumer", pct: 4.4 },
      { ticker: "SNOW",  name: "Snowflake", sector: "Technology", pct: 3.2 },
      { ticker: "COST",  name: "Costco", sector: "Consumer", pct: 2.8 },
      { ticker: "KO",    name: "Coca-Cola", sector: "Consumer", pct: 2.6 },
      { ticker: "FCX",   name: "Freeport-McMoRan", sector: "Materials", pct: 2.5 },
    ],
    // Growth of $10,000 over the past year: fund vs. benchmark
    growth: {"dates": ["2025-10-21", "2025-10-27", "2025-10-30", "2025-11-05", "2025-11-11", "2025-11-14", "2025-11-20", "2025-11-26", "2025-12-01", "2025-12-05", "2025-12-11", "2025-12-16", "2025-12-22", "2025-12-26", "2025-12-31", "2026-01-06", "2026-01-12", "2026-01-15", "2026-01-21", "2026-01-27", "2026-02-02", "2026-02-05", "2026-02-11", "2026-02-17", "2026-02-20", "2026-02-26", "2026-03-04", "2026-03-09", "2026-03-13", "2026-03-19", "2026-03-24", "2026-03-30", "2026-04-03", "2026-04-08", "2026-04-14", "2026-04-20", "2026-04-23", "2026-04-29", "2026-05-05", "2026-05-08", "2026-05-14", "2026-05-20", "2026-05-25", "2026-05-29", "2026-06-04", "2026-06-09", "2026-06-15", "2026-06-19", "2026-06-24", "2026-06-30", "2026-07-06", "2026-07-09", "2026-07-15", "2026-07-21", "2026-07-27", "2026-07-30", "2026-08-05", "2026-08-11", "2026-08-14", "2026-08-20", "2026-08-26", "2026-08-31", "2026-09-04", "2026-09-10", "2026-09-15", "2026-09-21", "2026-09-25", "2026-09-30", "2026-10-06", "2026-10-12", "2026-10-15", "2026-10-21"], "fund": [10000, 10248, 10199, 10127, 10177, 9940, 9653, 10095, 10118, 10202, 10252, 10033, 10140, 10251, 10126, 10426, 10501, 10482, 10349, 10544, 10465, 10112, 10414, 10279, 10393, 10446, 10338, 10240, 10001, 9987, 9895, 9499, 9912, 10293, 10605, 10753, 10733, 10770, 11041, 11245, 11338, 11205, 11295, 11489, 11520, 11205, 11467, 11428, 11117, 11439, 11464, 11406, 11447, 11348, 11143, 11231, 11767, 11882, 11947, 11721, 11819, 11809, 11823, 11563, 11494, 11798, 11747, 11646, 11931, 11884, 11714, 11630], "bench": [10000, 10194, 10117, 10084, 10141, 9968, 9692, 10108, 10095, 10180, 10229, 10108, 10217, 10292, 10172, 10315, 10361, 10303, 10195, 10344, 10340, 10049, 10255, 10109, 10205, 10205, 10151, 10029, 9775, 9730, 9638, 9314, 9695, 10004, 10297, 10530, 10522, 10551, 10741, 10976, 11122, 11005, 11081, 11266, 11249, 10951, 11226, 11175, 10944, 11165, 11226, 11219, 11256, 11148, 11005, 11039, 11507, 11468, 11551, 11332, 11402, 11410, 11456, 11258, 11238, 11543, 11508, 11388, 11614, 11580, 11481, 11441]},
  },

  // Investment Policy Statement PDF, hosted on this site.
  // Save the final PDF at website/documents/investment-policy-statement.pdf
  // The link stays hidden until the file is there.
  ipsLink: "documents/investment-policy-statement.pdf",

  // ── Alumni ───────────────────────────────────────────────────────────
  // firm / role: fill in where they work now; shown when present.
  alumni: [
    { name: "Giselle Alexander", classYear: 2027, firm: "", role: "", linkedin: "" },
    { name: "Maddie Buckley", classYear: 2027, firm: "", role: "", linkedin: "" },
    { name: "Niraj Dhaliwal", classYear: 2027, firm: "", role: "", linkedin: "" },
    { name: "Carly Marks", classYear: 2027, firm: "", role: "", linkedin: "" },
    { name: "Anna Oeser", classYear: 2027, firm: "", role: "", linkedin: "" },
    { name: "Suhani Akhouri", classYear: 2026, firm: "", role: "", linkedin: "" },
    { name: "Cole Bechtel", classYear: 2026, firm: "", role: "", linkedin: "" },
    { name: "Kate Bland", classYear: 2026, firm: "", role: "", linkedin: "" },
    { name: "Ryan Hublitz", classYear: 2026, firm: "", role: "", linkedin: "" },
    { name: "Ishil Kukreja", classYear: 2026, firm: "", role: "", linkedin: "" },
    { name: "Ted McDonough", classYear: 2026, firm: "", role: "", linkedin: "" },
    { name: "Kunal Pandey", classYear: 2026, firm: "", role: "", linkedin: "" },
  ],

  // ── Recruiting timeline ──────────────────────────────────────────────
  // MOCKUP: dates to be confirmed.
  join: [
    { when: "", what: "Information session", detail: "Current members describe the program and the time commitment." },
    { when: "", what: "Application", detail: "A short written application, including a brief investment idea." },
    { when: "", what: "Interview", detail: "A conversation with student leaders and the faculty advisor." },
    { when: "", what: "Onboarding", detail: "New members join a sector team as analysts." },
  ],
};
