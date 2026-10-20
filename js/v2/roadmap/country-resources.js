/**
 * National services by country, used when the roadmap model returns too few resources.
 * Official sites only; phone numbers only where they are the published short code.
 */

/** @typedef {import("./resources.js").LocalResource} LocalResource */

const US_STATE_CODES = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR".split(" ")
);

/** @type {Record<string, string[]>} */
const COUNTRY_ALIASES = {
  us: ["us", "usa", "u s", "u s a", "united states", "united states of america", "america"],
  uk: ["uk", "u k", "gb", "united kingdom", "great britain", "britain", "england", "scotland", "wales", "northern ireland"],
  ca: ["ca", "can", "canada"],
  au: ["au", "aus", "australia"],
  ie: ["ie", "ireland", "republic of ireland", "eire"],
  nz: ["nz", "new zealand", "aotearoa"],
  de: ["de", "germany", "deutschland"],
  fr: ["fr", "france"],
  es: ["es", "spain", "espana"],
  in: ["in", "india", "bharat"],
  mx: ["mx", "mexico"],
  ph: ["ph", "philippines", "the philippines"]
};

/**
 * @param {Partial<LocalResource>} item
 * @returns {LocalResource}
 */
function resource(item) {
  return {
    name: "",
    org: "",
    kind: "public service",
    place: "",
    why: "",
    offers: "",
    nextStep: "",
    details: "",
    url: "",
    email: "",
    phone: "",
    address: "",
    contact: "",
    notes: "",
    emailDraft: "",
    phoneDraft: "",
    draft: "",
    ...item
  };
}

/** @type {Record<string, { name: string, stability: LocalResource[], work: LocalResource[] }>} */
const COUNTRY_PACKS = {
  us: {
    name: "United States",
    stability: [
      resource({
        name: "211",
        org: "211",
        kind: "helpline",
        why: "Free, confidential line that connects you to local shelter, food, and ID help.",
        nextStep: "Tell them your city and whether you need a bed, food, or help replacing ID tonight. Write down who to call next.",
        url: "https://www.211.org/",
        phone: "211"
      }),
      resource({
        name: "Findhelp",
        org: "Findhelp",
        kind: "directory",
        why: "Search free and reduced-cost local services by ZIP code.",
        nextStep: "Search your ZIP, then open the listing that names a real office and a phone number.",
        url: "https://www.findhelp.org/"
      })
    ],
    work: [
      resource({
        name: "American Job Centers",
        org: "CareerOneStop",
        why: "Free, government-funded job centers with career coaching, training money, and hiring events.",
        nextStep: "Find the center nearest you and book a first visit with a career counselor.",
        url: "https://www.careeronestop.org/LocalHelp/AmericanJobCenters/find-american-job-centers.aspx"
      })
    ]
  },
  uk: {
    name: "United Kingdom",
    stability: [
      resource({
        name: "Citizens Advice",
        org: "Citizens Advice",
        kind: "advice service",
        why: "Free, independent advice on benefits, housing, debt, and work.",
        nextStep: "Use the site to find your local Citizens Advice and ask what support you can claim.",
        url: "https://www.citizensadvice.org.uk/"
      }),
      resource({
        name: "Shelter",
        org: "Shelter",
        kind: "housing charity",
        why: "Housing advice and emergency help if you are homeless or about to be.",
        nextStep: "Open the get-help page and follow the steps for your situation tonight.",
        url: "https://www.shelter.org.uk/"
      })
    ],
    work: [
      resource({
        name: "Jobcentre Plus",
        org: "GOV.UK",
        why: "Your local Jobcentre handles Universal Credit, work coaches, and job support.",
        nextStep: "Find your local Jobcentre Plus and ask for a work coach appointment.",
        url: "https://www.gov.uk/contact-jobcentre-plus"
      }),
      resource({
        name: "National Careers Service",
        org: "GOV.UK",
        why: "Free careers advice and skills checks from qualified advisers.",
        nextStep: "Book a free call or web chat with an adviser about your next step.",
        url: "https://nationalcareers.service.gov.uk/"
      })
    ]
  },
  ca: {
    name: "Canada",
    stability: [
      resource({
        name: "211 Canada",
        org: "211 Canada",
        kind: "helpline",
        why: "Free line and search for local housing, food, and income help across Canada.",
        nextStep: "Call 211 or search your city, and write down the next office to contact.",
        url: "https://211.ca/",
        phone: "211"
      })
    ],
    work: [
      resource({
        name: "Job Bank",
        org: "Government of Canada",
        why: "The national job and labour-market service, with job alerts and career tools.",
        nextStep: "Search your city and set up a job alert that matches this path.",
        url: "https://www.jobbank.gc.ca/"
      })
    ]
  },
  au: {
    name: "Australia",
    stability: [
      resource({
        name: "Ask Izzy",
        org: "Infoxchange",
        kind: "directory",
        why: "Find nearby housing, food, and support services, free and anonymous.",
        nextStep: "Search your suburb for the service you need first and note the phone number.",
        url: "https://askizzy.org.au/"
      }),
      resource({
        name: "Services Australia",
        org: "Australian Government",
        why: "Centrelink payments, crisis payments, and income support.",
        nextStep: "Check which payment fits you and book a Centrelink appointment.",
        url: "https://www.servicesaustralia.gov.au/"
      })
    ],
    work: [
      resource({
        name: "Workforce Australia",
        org: "Australian Government",
        why: "The national employment service, with job search, training, and providers.",
        nextStep: "Set up your profile and search jobs and courses near you.",
        url: "https://www.workforceaustralia.gov.au/"
      })
    ]
  },
  ie: {
    name: "Ireland",
    stability: [
      resource({
        name: "Citizens Information",
        org: "Citizens Information Board",
        kind: "advice service",
        why: "Plain-language guidance on social welfare, housing, and employment rights.",
        nextStep: "Look up the payment or right that matches your situation, then contact your local centre.",
        url: "https://www.citizensinformation.ie/"
      })
    ],
    work: [
      resource({
        name: "JobsIreland",
        org: "Department of Social Protection",
        why: "The public employment service for jobs and Intreo employment support.",
        nextStep: "Register and search jobs in your county.",
        url: "https://jobsireland.ie/"
      })
    ]
  },
  nz: {
    name: "New Zealand",
    stability: [
      resource({
        name: "Citizens Advice Bureau",
        org: "Citizens Advice Bureau",
        kind: "advice service",
        why: "Free, confidential help with housing, money, and rights.",
        nextStep: "Find your nearest bureau and ask what help applies to you.",
        url: "https://www.cab.org.nz/"
      })
    ],
    work: [
      resource({
        name: "Work and Income",
        org: "Ministry of Social Development",
        why: "Income support, emergency grants, and job-search help.",
        nextStep: "Check what you can get and book an appointment with a case manager.",
        url: "https://www.workandincome.govt.nz/"
      })
    ]
  },
  de: {
    name: "Germany",
    stability: [],
    work: [
      resource({
        name: "Bundesagentur für Arbeit",
        org: "Federal Employment Agency",
        why: "Germany's public employment service: job search, career advice, and unemployment benefits.",
        nextStep: "Register with your local Agentur für Arbeit and book a counselling appointment.",
        url: "https://www.arbeitsagentur.de/"
      })
    ]
  },
  fr: {
    name: "France",
    stability: [],
    work: [
      resource({
        name: "France Travail",
        org: "France Travail",
        why: "France's public employment service (formerly Pôle emploi): job offers, training, and benefits.",
        nextStep: "Create your space and ask for an adviser at your local agency.",
        url: "https://www.francetravail.fr/"
      })
    ]
  },
  es: {
    name: "Spain",
    stability: [],
    work: [
      resource({
        name: "SEPE",
        org: "Servicio Público de Empleo Estatal",
        why: "Spain's public employment service for job search, training, and benefits.",
        nextStep: "Check the steps for your region and book an appointment at your employment office.",
        url: "https://www.sepe.es/"
      })
    ]
  },
  in: {
    name: "India",
    stability: [],
    work: [
      resource({
        name: "National Career Service",
        org: "Ministry of Labour and Employment",
        why: "The national portal for jobs, career counselling, and job fairs.",
        nextStep: "Register and look for career centres and job fairs in your city.",
        url: "https://www.ncs.gov.in/"
      })
    ]
  },
  mx: {
    name: "Mexico",
    stability: [],
    work: [
      resource({
        name: "Servicio Nacional de Empleo",
        org: "Gobierno de México",
        why: "The national employment service: job listings, job fairs, and training support.",
        nextStep: "Search openings in your state and find the nearest SNE office.",
        url: "https://www.empleo.gob.mx/"
      })
    ]
  },
  ph: {
    name: "Philippines",
    stability: [],
    work: [
      resource({
        name: "PhilJobNet",
        org: "Department of Labor and Employment",
        why: "The government job-matching portal, linked to local Public Employment Service Offices.",
        nextStep: "Register and search jobs near your city, then visit your local PESO.",
        url: "https://philjobnet.gov.ph/"
      })
    ]
  }
};

/** @param {string} value */
function simplify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Two-letter pack key for a location, or "" when the country is unknown.
 * @param {{ country?: string, region?: string } | null | undefined} location
 */
export function countryKey(location) {
  const country = simplify(location?.country || "");
  if (country) {
    for (const [key, aliases] of Object.entries(COUNTRY_ALIASES)) {
      if (aliases.includes(country)) return key;
    }
    return "";
  }
  const region = String(location?.region || "").trim().toUpperCase();
  return US_STATE_CODES.has(region) ? "us" : "";
}

/**
 * @param {{ country?: string, region?: string, city?: string } | null | undefined} location
 * @param {"stability" | "work"} need
 * @returns {LocalResource[]}
 */
export function countryResources(location, need) {
  const pack = COUNTRY_PACKS[countryKey(location)];
  if (!pack) return [];
  return pack[need].map((item) => ({ ...item, place: item.place || pack.name }));
}

/** @param {{ country?: string, region?: string } | null | undefined} location */
export function countryName(location) {
  const pack = COUNTRY_PACKS[countryKey(location)];
  return pack?.name || String(location?.country || "").trim();
}
