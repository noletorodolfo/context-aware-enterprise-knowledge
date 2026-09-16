import { z } from "zod";

export const MAX_QUESTION_LENGTH = 1000;

export const askRequestSchema = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
  page: z.object({
    url: z.url(),
    title: z.string().min(1),
    siteUrl: z.url(),
    listTitle: z.string().optional(),
  }),
});
