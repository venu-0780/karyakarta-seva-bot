// Copy for the native WhatsApp forms. The Flow JSON only has placeholders;
// these strings are sent with the form so it follows the language the user set.
// Short labels stay in one language: WhatsApp caps them at 20–35 characters,
// and `both` cannot fit. Paragraphs still show both languages when that is the choice.
import { L, LB, type LangPref, type Phrase } from "../services/i18n.js";

function paragraph(pref: LangPref, phrase: Phrase): string {
  return L(pref, phrase);
}

function short(pref: LangPref, phrase: Phrase, max: number): string {
  const text = LB(pref, phrase);
  return text.length <= max ? text : text.slice(0, max);
}

function option(id: string, pref: LangPref, phrase: Phrase): { id: string; title: string } {
  return { id, title: short(pref, phrase, 30) };
}

export function idFormData(pref: LangPref): Record<string, string> {
  return {
    title: short(pref, { te: "ఐడి స్థితి", en: "ID status" }, 30),
    intro: paragraph(pref, {
      te: "మీ నమోదిత మొబైల్ నంబర్‌తో ఐడి కార్డు స్థితి చూడండి.",
      en: "Check your ID card status with your registered mobile number.",
    }),
    mobile_label: short(pref, { te: "మొబైల్ నంబర్", en: "Mobile number" }, 20),
    mobile_help: short(pref, { te: "10 అంకెలు, ఉదా: 9876543210", en: "10 digits, e.g. 9876543210" }, 80),
    submit_label: short(pref, { te: "స్థితి చూడండి", en: "Check status" }, 35),
  };
}

export function pollFormData(pref: LangPref): Record<string, string> {
  return {
    title: short(pref, { te: "పోల్", en: "Poll" }, 30),
    choose_label: short(pref, { te: "ఒకటి ఎంచుకోండి", en: "Choose one" }, 30),
    vote_label: short(pref, { te: "ఓటు వేయండి", en: "Vote" }, 35),
  };
}

export function feedbackFormData(pref: LangPref): Record<string, unknown> {
  return {
    title: short(pref, { te: "అభిప్రాయం", en: "Feedback" }, 30),
    intro: paragraph(pref, {
      te: "మీ సందేశం రకాన్ని ఎంచుకోండి.",
      en: "Choose what this message is about.",
    }),
    type_label: short(pref, { te: "రకం", en: "Type" }, 30),
    categories: [
      option("complaint", pref, { te: "ఫిర్యాదు", en: "Complaint" }),
      option("suggestion", pref, { te: "సూచన", en: "Suggestion" }),
      option("feedback", pref, { te: "అభిప్రాయం", en: "Feedback" }),
    ],
    next_label: short(pref, { te: "తర్వాత", en: "Next" }, 35),
    details_title: short(pref, { te: "వివరాలు", en: "Details" }, 30),
    details_label: short(pref, { te: "వివరాలు", en: "What happened?" }, 20),
    details_help: short(pref, { te: "ఒకటి లేదా రెండు వాక్యాలు", en: "A sentence or two" }, 80),
    contact_title: short(pref, { te: "సంప్రదింపు", en: "Contact" }, 30),
    reply_label: short(pref, { te: "ఎలా సంప్రదించాలి?", en: "How should we reply?" }, 30),
    replies: [
      option("whatsapp", pref, { te: "WhatsApp", en: "WhatsApp" }),
      option("call", pref, { te: "ఫోన్ కాల్", en: "Phone call" }),
    ],
    phone_label: short(pref, { te: "ఫోన్ (ఐచ్చికం)", en: "Phone (optional)" }, 20),
    submit_label: short(pref, { te: "పంపండి", en: "Submit" }, 35),
  };
}

export function eventFormData(pref: LangPref): Record<string, unknown> {
  return {
    title: short(pref, { te: "నమోదు", en: "Register" }, 30),
    intro: paragraph(pref, {
      te: "ప్రెస్ మీట్‌కు హాజరు నమోదు చేయండి.",
      en: "Register to attend a press meet.",
    }),
    name_label: short(pref, { te: "పేరు", en: "Your name" }, 20),
    phone_label: short(pref, { te: "మొబైల్", en: "Mobile" }, 20),
    next_label: short(pref, { te: "తర్వాత", en: "Next" }, 35),
    event_title: short(pref, { te: "కార్యక్రమం", en: "Event" }, 30),
    constituency_label: short(pref, { te: "నియోజకవర్గం", en: "Constituency" }, 20),
    attendees_label: short(pref, { te: "ఎంతమంది?", en: "How many?" }, 20),
    day_label: short(pref, { te: "ఏ రోజు?", en: "Which day?" }, 30),
    slots: [
      option("today", pref, { te: "ఈ రోజు", en: "Today" }),
      option("tomorrow", pref, { te: "రేపు", en: "Tomorrow" }),
      option("either", pref, { te: "ఏదైనా", en: "Either" }),
    ],
    register_label: short(pref, { te: "నమోదు", en: "Register" }, 35),
  };
}

export function membershipFormData(pref: LangPref): Record<string, unknown> {
  return {
    title: short(pref, { te: "సభ్యత్వం", en: "Membership" }, 30),
    intro: paragraph(pref, {
      te: "ఐడి కార్డు దరఖాస్తు.",
      en: "Apply for a membership ID card.",
    }),
    name_label: short(pref, { te: "పూర్తి పేరు", en: "Full name" }, 20),
    phone_label: short(pref, { te: "మొబైల్", en: "Mobile" }, 20),
    next_label: short(pref, { te: "తర్వాత", en: "Next" }, 35),
    place_title: short(pref, { te: "చిరునామా", en: "Address" }, 30),
    constituency_label: short(pref, { te: "నియోజకవర్గం", en: "Constituency" }, 20),
    address_label: short(pref, { te: "చిరునామా", en: "Address" }, 20),
    consent_label: short(pref, {
      te: "సంప్రదించడానికి అంగీకరిస్తున్నాను",
      en: "I agree to be contacted",
    }, 120),
    apply_label: short(pref, { te: "దరఖాస్తు", en: "Apply" }, 35),
  };
}

export function surveyFormData(pref: LangPref): Record<string, unknown> {
  return {
    title: short(pref, { te: "రేటింగ్", en: "Rating" }, 30),
    intro: paragraph(pref, {
      te: "ఈ హెల్ప్‌డెస్క్ ఎంత ఉపయోగంగా ఉంది?",
      en: "How useful is this helpdesk?",
    }),
    rating_label: short(pref, { te: "రేటింగ్", en: "Rating" }, 30),
    ratings: [
      option("5", pref, { te: "5 — చాలా బాగుంది", en: "5 — Excellent" }),
      option("4", pref, { te: "4 — బాగుంది", en: "4 — Good" }),
      option("3", pref, { te: "3 — సరే", en: "3 — Okay" }),
      option("2", pref, { te: "2 — బాలేదు", en: "2 — Needs work" }),
      option("1", pref, { te: "1 — పనికిరాదు", en: "1 — Not useful" }),
    ],
    next_label: short(pref, { te: "తర్వాత", en: "Next" }, 35),
    note_title: short(pref, { te: "వ్యాఖ్య", en: "Comment" }, 30),
    comment_label: short(pref, { te: "మరింత చెప్పండి", en: "Anything else?" }, 20),
    send_label: short(pref, { te: "పంపండి", en: "Send" }, 35),
  };
}
