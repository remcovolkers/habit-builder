// Wat een feedbackbericht is: een van vier soorten en een tekst van hoogstens FEEDBACK_BODY_MAX tekens. Dezelfde grenzen staan in
// supabase/migrations/0007_feedback.sql (de server controleert ze ook). Puur.
export const FEEDBACK_KINDS = Object.freeze(['idea', 'problem', 'question', 'compliment']);
export const FEEDBACK_BODY_MAX = 1000;
