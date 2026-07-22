/**
 * Hunter regression fixtures.
 *
 * Each case describes a prospect and what a correct Hunter output looks
 * like. The eval harness (scripts/eval-hunter.ts) runs Hunter against
 * every case and reports a pass rate. Run BEFORE and AFTER any change
 * to lib/agents/hunter/prompt.ts.
 *
 * Add cases whenever Hunter surprises you in production — that is how
 * you accumulate regression coverage over time.
 */

export type HunterEvalCase = {
  name: string;
  icp: string | null;
  input: string;
  expected: {
    fit: boolean;
    scoreMin?: number;
    scoreMax?: number;
  };
};

const WELLNESS_SMB_ICP =
  "Independent wellness and services SMBs in the US: yoga studios, " +
  "pilates studios, boutique gyms, physical therapy clinics, chiropractors, " +
  "med spas, and personal-training studios. Owner-operated, 1-5 locations, " +
  "under 30 employees. Growth-minded owners open to marketing or ops help. " +
  "Avoid enterprise chains, franchises with corporate marketing, and " +
  "non-wellness verticals (SaaS, e-commerce, agencies, restaurants).";

export const HUNTER_EVAL_CASES: HunterEvalCase[] = [
  {
    name: "obvious-fit-boutique-yoga",
    icp: WELLNESS_SMB_ICP,
    input:
      "Sunrise Yoga Studio, single location in Austin TX, owner-operated by " +
      "founder Kelly Nguyen. 8 instructors, ~200 active members. Owner has " +
      "posted on LinkedIn about wanting to grow membership past 300 but " +
      "struggling with marketing.",
    expected: { fit: true, scoreMin: 4 },
  },
  {
    name: "obvious-fit-pt-clinic",
    icp: WELLNESS_SMB_ICP,
    input:
      "Kinetic Physical Therapy, 2 locations in Denver metro. Owned by Dr. " +
      "Rajesh Patel. 12 clinicians. Rated 4.9 on Google with 400+ reviews. " +
      "Recently hired a front-desk manager; owner mentions in a podcast " +
      "that ops are eating his time.",
    expected: { fit: true, scoreMin: 3 },
  },
  {
    name: "obvious-miss-enterprise-saas",
    icp: WELLNESS_SMB_ICP,
    input:
      "Datadog, publicly traded infrastructure monitoring SaaS. ~5000 " +
      "employees. Global sales operation. CFO looking for cost-optimization " +
      "vendors.",
    expected: { fit: false, scoreMax: 2 },
  },
  {
    name: "obvious-miss-franchise-chain",
    icp: WELLNESS_SMB_ICP,
    input:
      "Planet Fitness, corporate. 2,500+ locations, publicly traded. " +
      "National marketing budget managed by in-house team.",
    expected: { fit: false, scoreMax: 2 },
  },
  {
    name: "edge-med-spa-mid-size",
    icp: WELLNESS_SMB_ICP,
    input:
      "Glow Med Spa Group, 4 locations across Miami metro, private-equity " +
      "backed. 25 staff. Growth strategy set by PE partners. Marketing done " +
      "by an outsourced agency on retainer.",
    expected: { fit: false, scoreMax: 3 },
  },
];
