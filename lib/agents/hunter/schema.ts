import { z } from "zod";

export const HunterOutputSchema = z.object({
  fit: z.boolean(),
  score: z.number().int().min(1).max(5),
  reason: z.string().min(1),
  suggested_action: z.string().min(1),
});

export type HunterOutput = z.infer<typeof HunterOutputSchema>;
