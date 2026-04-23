/**
 * Template renderer for owner-specific text.
 *
 * Replaces placeholders like {{owner.name}}, {{assistant.name}},
 * {{owner.pronoun.you}} with values from owner-config, so that
 * workspace/identity/*.md and workspace/policies/*.md can be shipped as
 * generic templates that any user installs and personalises.
 */
import type { OwnerConfig, FamilyMember } from "./owner-config";

/** Hebrew pronoun set — differs by addressee gender. */
interface HebrewPronouns {
  /** 2nd person "you" — אתה / את */
  you: string;
  /** "your" (masc/fem) — same spelling, different reading: שלך */
  your: string;
  /** "want" conjugated for addressee gender — רוצה / רוצה (same spelling!) */
  want: string;
  /** "need" — צריך / צריכה */
  need: string;
  /** "know" — יודע / יודעת */
  know: string;
  /** 3rd person "he/she" — הוא / היא */
  he: string;
  /** "man"/"woman" label — גבר / אישה */
  label: string;
  /** Possessive "his/hers" — שלו / שלה */
  hisHers: string;
  /** "to him/to her" — אליו / אליה */
  toHim: string;
  /** "addressing" verb: פני אליו / פני אליה */
  addressPhrase: string;
}

const HEBREW_PRONOUNS_MALE: HebrewPronouns = {
  you: "אתה",
  your: "שלך",
  want: "רוצה",
  need: "צריך",
  know: "יודע",
  he: "הוא",
  label: "גבר",
  hisHers: "שלו",
  toHim: "אליו",
  addressPhrase: "פני אליו בלשון זכר",
};

const HEBREW_PRONOUNS_FEMALE: HebrewPronouns = {
  you: "את",
  your: "שלך",
  want: "רוצה",
  need: "צריכה",
  know: "יודעת",
  he: "היא",
  label: "אישה",
  hisHers: "שלה",
  toHim: "אליה",
  addressPhrase: "פני אליה בלשון נקבה",
};

export function getPronouns(gender: "male" | "female"): HebrewPronouns {
  return gender === "female" ? HEBREW_PRONOUNS_FEMALE : HEBREW_PRONOUNS_MALE;
}

/** Format a family list as Hebrew text — e.g. "רני ואלי (אבא של רני)" */
export function formatPrivilegedAccess(owner: OwnerConfig): string {
  const privileged = owner.family.filter((f) => f.hasPrivilegedAccess);
  if (privileged.length === 0) {
    return owner.name;
  }
  const parts = [owner.name, ...privileged.map((f) => formatFamilyReference(f, owner))];
  return parts.join(" ו");
}

function relationLabel(rel: FamilyMember["relation"], ownerGender: "male" | "female"): string {
  // Relation labels from owner's perspective.
  const isOwnerMale = ownerGender === "male";
  switch (rel) {
    case "father":
      return "אבא";
    case "mother":
      return "אמא";
    case "spouse":
      return isOwnerMale ? "אשתו" : "בעלה";
    case "sibling":
      return "אח/ות";
    case "child":
      return "ילד/ה";
    default:
      return "";
  }
}

/** Render a family member as e.g. "אלי (אבא של רני)". */
export function formatFamilyReference(member: FamilyMember, owner: OwnerConfig): string {
  const label = relationLabel(member.relation, owner.gender);
  if (!label) return member.name;
  return `${member.name} (${label} של ${owner.name})`;
}

/**
 * Render a template string by replacing {{...}} placeholders with
 * values derived from owner-config.
 *
 * Supported placeholders:
 *   {{owner.name}} {{owner.fullName}} {{owner.nameEn}}
 *   {{owner.email}} {{owner.phone}}
 *   {{owner.gender}}            — "male" / "female"
 *   {{owner.gender.label}}      — "גבר" / "אישה"
 *   {{owner.pronoun.you}}       — "אתה" / "את"
 *   {{owner.pronoun.your}}      — "שלך"
 *   {{owner.pronoun.want}}      — "רוצה"
 *   {{owner.pronoun.need}}      — "צריך" / "צריכה"
 *   {{owner.pronoun.he}}        — "הוא" / "היא"
 *   {{owner.pronoun.hisHers}}   — "שלו" / "שלה"
 *   {{owner.pronoun.toHim}}     — "אליו" / "אליה"
 *   {{owner.pronoun.address}}   — "פני אליו בלשון זכר" / "פני אליה בלשון נקבה"
 *   {{owner.family.father}}     — first father's name, or "" if none
 *   {{owner.family.father.full}}— first father's full ref with relation
 *   {{owner.family.mother}}     — first mother's name
 *   {{owner.family.spouse}}     — spouse's name
 *   {{owner.privilegedAccess}}  — e.g. "רני ואלי (אבא של רני)"
 *   {{assistant.name}} {{assistant.nameEn}}
 *   {{crmLabel}}                — e.g. "ביטוח אופיר" (empty string if crm disabled)
 */
export function renderOwnerTemplate(template: string, owner: OwnerConfig): string {
  if (!template.includes("{{")) return template;

  const pronouns = getPronouns(owner.gender);
  const father = owner.family.find((f) => f.relation === "father");
  const mother = owner.family.find((f) => f.relation === "mother");
  const spouse = owner.family.find((f) => f.relation === "spouse");

  const replacements: Record<string, string> = {
    "owner.name": owner.name,
    "owner.fullName": owner.fullName || owner.name,
    "owner.nameEn": owner.nameEn || "",
    "owner.email": owner.email,
    "owner.phone": owner.phone,
    "owner.gender": owner.gender,
    "owner.gender.label": pronouns.label,
    "owner.pronoun.you": pronouns.you,
    "owner.pronoun.your": pronouns.your,
    "owner.pronoun.want": pronouns.want,
    "owner.pronoun.need": pronouns.need,
    "owner.pronoun.know": pronouns.know,
    "owner.pronoun.he": pronouns.he,
    "owner.pronoun.hisHers": pronouns.hisHers,
    "owner.pronoun.toHim": pronouns.toHim,
    "owner.pronoun.address": pronouns.addressPhrase,
    "owner.family.father": father?.name || "",
    "owner.family.father.full": father ? formatFamilyReference(father, owner) : "",
    "owner.family.mother": mother?.name || "",
    "owner.family.mother.full": mother ? formatFamilyReference(mother, owner) : "",
    "owner.family.spouse": spouse?.name || "",
    "owner.family.spouse.full": spouse ? formatFamilyReference(spouse, owner) : "",
    "owner.privilegedAccess": formatPrivilegedAccess(owner),
    "assistant.name": owner.assistant.name,
    "assistant.nameEn": owner.assistant.nameEn,
    "crmLabel": owner.crmLabel || "",
  };

  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => {
    const value = replacements[key];
    return value !== undefined ? value : match;
  });
}
