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
  email: "nazanin.khosravi20.nk@gmail.com",
  phone: "+98 21 8800 0000",
  phoneHref: "+982188000000",
  url: "https://arkan.co",
  statement:
    "We help small and medium-sized businesses build sustainable, measurable growth through clear strategy and disciplined execution.",
} as const;

/**
 * Rooted rather than bare fragments (`/#services`, not `#services`).
 *
 * The header is shared with /consultant, where a bare `#services` would look
 * for a section that is not on the page. On the home page the browser still
 * treats these as same-document navigation, so the smooth scrolling is
 * unaffected.
 */
export const nav = [
  { label: "Services", href: "/#services" },
  { label: "Process", href: "/#process" },
  { label: "About", href: "/#about" },
  { label: "Ask Arkan", href: "/consultant" },
  { label: "Contact", href: "/#contact" },
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

/**
 * The assistant's interface copy.
 *
 * The words the assistant *says* are not here — those come from the system
 * prompt in the database, which an operator edits without a deploy. This is the
 * furniture around it: labels, placeholders, empty states and the sentences
 * shown when something goes wrong.
 *
 * `starters` are questions the knowledge base should be able to answer from the
 * client brief alone. They double as the honest boundary of the assistant's
 * scope, which is why none of them asks for advice about a specific business:
 * the assistant guides, and the consultation is where advice happens.
 */
export const assistant = {
  eyebrow: "Ask Arkan",
  heading: "Ask about how we work.",
  intro:
    "Questions about our services, the four pillars, or what an engagement looks like. Answers come from Arkan's own material, and the assistant will tell you when it does not know something.",
  disclaimer:
    "An AI assistant, not a consultant. It cannot advise on your business — that is what the first conversation is for.",
  inputLabel: "Your question",
  inputPlaceholder: "What does an engagement with Arkan involve?",
  send: "Send",
  sending: "Sending",
  replying: "Arkan's assistant is replying",
  startersHeading: "Try one of these",
  starters: [
    "What does Arkan actually do?",
    "What are the four pillars?",
    "How does a first engagement start?",
    "Who is Arkan a good fit for?",
  ],
  sourcesLabel: "Sources",
  sourcesEmpty: "No source in the knowledge base covered this.",
  ctaHeading: "Ready to talk to someone?",
  ctaBody:
    "The first conversation is free, and the team replies within 24 business hours.",
  cta: "Request a Consultation",
  newConversation: "Start a new conversation",
  helpful: "This was helpful",
  notHelpful: "This was not helpful",
  feedbackThanks: "Thank you — noted.",
  offline:
    "The assistant is not available right now. Please use the consultation form, or email nazanin.khosravi20.nk@gmail.com.",
  errorMessage:
    "Something went wrong at our end. Please try again, or email nazanin.khosravi20.nk@gmail.com.",
  emptyMessage: "Ask a question and the assistant will answer if it can.",
  widget: {
    launcher: "Ask Arkan",
    close: "Close the assistant",
    title: "Arkan assistant",
  },
  /**
   * The launcher on Arkan's own pages — a different surface from the widget:
   * no iframe, no host site, and a visitor who is already reading the firm's
   * own words. `open` is phrased as what pressing the button does rather than
   * as a bare noun, because it is the accessible name of an icon-only control.
   */
  bubble: {
    open: "Ask Arkan a question",
    close: "Close the assistant",
    title: "Ask Arkan",
    subtitle: "Answers from Arkan's own material.",
    expand: "Open the full page",
  },
} as const;

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
