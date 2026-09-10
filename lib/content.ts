/**
 * Every user-facing string on the site.
 *
 * Sourced from "Arkan — Client & Company Brief_En.md" and
 * "Arkan — Brand Guide_En.md". Nothing here may be invented: no statistics,
 * testimonials, clients, awards or case studies that the brief does not state.
 * Testimonials are reproduced verbatim.
 */

export const company = {
  name: "Arkan",
  fullName: "Arkan — Business Strategy & Growth Advisory",
  tagline: "The Pillars of Sustainable Growth",
  founded: 2017,
  city: "Tehran",
  country: "Iran",
  email: "info@arkan.co",
  phone: "+98 21 8800 0000",
  phoneHref: "+982188000000",
  url: "https://arkan.co",
  statement:
    "We help small and medium-sized businesses build sustainable, measurable growth through clear strategy and disciplined execution.",
} as const;

export const nav = [
  { label: "Services", href: "#services" },
  { label: "Process", href: "#process" },
  { label: "About", href: "#about" },
  { label: "Contact", href: "#contact" },
] as const;

export const hero = {
  headline: "When growth stalls, the problem is rarely effort.",
  supporting:
    "Arkan helps small and medium businesses find where growth is actually blocked — then stays alongside you until the plan becomes results.",
  trustLine: "Advising small and medium businesses from Tehran since 2017.",
  primaryCta: "Request a Free Consultation",
  secondaryCta: "See how we work",
  imageAlt:
    "A consultant standing at the window of an Arkan meeting room, looking out over Tehran.",
} as const;

export const services = {
  eyebrow: "Services",
  heading: "Where we work with you",
  intro: "Five areas founders bring us in for.",
  items: [
    {
      icon: "compass",
      title: "Growth Strategy Consulting",
      description: "Where to compete, and what your real advantage is.",
    },
    {
      icon: "model",
      title: "Business Model Redesign",
      description: "For when the model that got you here stops working.",
    },
    {
      icon: "market",
      title: "Brand & Marketing Strategy",
      description: "Positioning and marketing that bring the right customers in.",
    },
    {
      icon: "structure",
      title: "Organisational Structure & Process Design",
      description: "The team, roles and processes your strategy needs to run.",
    },
    {
      icon: "sales",
      title: "Sales & Market Development",
      description: "Opening new channels and rebuilding how you sell.",
    },
  ],
} as const;

export const pillars = {
  eyebrow: "Methodology",
  heading: "The four pillars",
  intro:
    "Every engagement is built on the same four parts. Each one holds up the others.",
  items: [
    {
      title: "Strategy",
      description:
        "Direction, competitive advantage, and deciding where to compete.",
    },
    {
      title: "Structure",
      description:
        "The organisation, processes and team required to execute the strategy.",
    },
    {
      title: "Market",
      description: "Brand, marketing and sales strategies that attract customers.",
    },
    {
      title: "Execution",
      description: "Turning plans into measurable results.",
    },
  ],
} as const;

export const process = {
  eyebrow: "Process",
  heading: "What happens next",
  intro: "Four steps from your first message to a plan you can act on.",
  steps: [
    {
      title: "Submit a Request",
      description: "You complete the consultation request form below.",
    },
    {
      title: "Initial Conversation",
      description:
        "We contact you within one business day. The first call is free.",
    },
    {
      title: "Consultation Session",
      description:
        "A focused session to assess your business and identify its key challenges.",
    },
    {
      title: "Roadmap",
      description: "We present a recommended plan and the path forward.",
    },
  ],
} as const;

export const credibility = {
  eyebrow: "About",
  heading: "Who you would be working with",
  stats: [
    { value: "7+", label: "Years of experience" },
    { value: "200+", label: "Successful projects" },
    { value: "12", label: "Experienced consultants" },
  ],
  founder: {
    name: "Babak Arianfar",
    role: "Founder & CEO",
    bio: "Eighteen years in management and consulting. Before founding Arkan in 2017, Business Development Director at two major holding companies.",
  },
  imageAlt:
    "Four Arkan consultants working through documents together around a meeting table.",
  testimonialsHeading: "What clients say",
  testimonials: [
    {
      quote:
        "Arkan didn't just give us a report; they stayed with us for six months to make sure the plan was actually implemented.",
      attribution: "CEO, Manufacturing Company",
    },
    {
      quote:
        "After three years of going nowhere, it was the first time we felt we knew exactly where to focus.",
      attribution: "Founder, Service Startup",
    },
  ],
} as const;

export const consultation = {
  eyebrow: "Consultation request",
  heading: "Tell us where you're stuck.",
  intro:
    "The first conversation is free. Share a little about your business and we'll get back to you within one business day.",
  submitLabel: "Request a Free Consultation",
  submittingLabel: "Submitting...",
  successTitle: "Request received",
  successMessage:
    "Your request has been submitted. The Arkan team will contact you within one business day.",
  errorMessage:
    "Something went wrong. Please try again or contact us directly.",
  errorSummaryTitle: "Please check the following before submitting",
  requiredNote: "Fields marked (required) must be completed.",
  fields: {
    fullName: { label: "Full Name", placeholder: "Your name" },
    phone: { label: "Phone Number", placeholder: "+98 ..." },
    email: { label: "Email", placeholder: "you@company.com" },
    businessName: { label: "Business Name", placeholder: "Your company" },
    industry: { label: "Industry", placeholder: "e.g. Manufacturing" },
    stage: { label: "Business Stage", placeholder: "Select a stage" },
    challenge: {
      label: "What is your biggest current challenge?",
      placeholder:
        "A few sentences are enough — where growth has stalled, and what you have already tried.",
    },
    preferredTime: {
      label: "Preferred Contact Time",
      placeholder: "Select a time",
    },
  },
} as const;

export const businessStages = [
  "Idea",
  "Early-stage",
  "Growing",
  "Established",
] as const;

export const contactTimes = ["Morning", "Afternoon", "Evening"] as const;

export const footer = {
  statement: company.statement,
  contactHeading: "Contact",
  navHeading: "Sections",
  copyright: `© ${new Date().getFullYear()} ${company.fullName}. All rights reserved.`,
} as const;

export const seo = {
  title: "Arkan — Business Strategy & Growth Advisory",
  titleTemplate: "%s | Arkan",
  description:
    "Arkan is a business strategy and growth advisory firm in Tehran. We help small and medium businesses find where growth is blocked and stay alongside them through implementation. Request a free consultation.",
  ogImageAlt:
    "An Arkan consultant in a meeting room overlooking Tehran, beside the Arkan wordmark.",
} as const;

/**
 * The AI assistant.
 *
 * Wording follows the brand guide the same way the rest of the site does:
 * short sentences, no exclamation marks, and no promise the consultation
 * itself would not make. The starters are phrased the way the brief says the
 * audience thinks — "how can you help my business, and what should I do next?"
 */
export const assistant = {
  eyebrow: "Ask Arkan",
  heading: "Questions before you book?",
  supporting:
    "Ask about how we work, what a consultation involves, or where we usually start. The assistant answers from what Arkan has published — and hands you to the team when a question needs a person.",

  inputLabel: "Your question",
  placeholder: "Ask about how Arkan works…",
  send: "Send",
  sending: "Sending",

  starters: [
    "How does Arkan actually help a business that has stopped growing?",
    "What happens in the first consultation?",
    "What are the four pillars?",
    "How long does working with Arkan usually take?",
  ],

  emptyHeading: "Where would you like to start?",
  emptyBody: "Pick a question, or write your own.",

  sourcesLabel: "Sources",
  disclaimer:
    "The assistant can be wrong. Nothing here is formal advice, and the team confirms anything that matters.",

  handoffNotice:
    "A member of the team has been notified and will follow up with you.",
  leadNotice: "Your request is recorded. The team will contact you within one business day.",

  errorMessage:
    "Something went wrong on our side. Please try again, or use the form below.",
  unavailable:
    "The assistant is not available right now. The consultation form below still works.",

  resetLabel: "Start over",
  ctaHeading: "Ready to talk to a person?",
  ctaBody: "The first conversation is free and takes about 30 minutes.",
  ctaLabel: "Request a consultation",
} as const;
