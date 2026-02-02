import { Agent } from "./types";

/**
 * Calculate compatibility score between two agents.
 * Based on shared interests and complementary traits.
 * Returns a score from 0 to 100.
 */
export function calculateCompatibility(agent1: Agent, agent2: Agent): number {
  let score = 0;

  // Shared interests (up to 50 points)
  const interests1 = new Set(agent1.interests || []);
  const interests2 = new Set(agent2.interests || []);

  if (interests1.size > 0 && interests2.size > 0) {
    const shared = [...interests1].filter((x) => interests2.has(x));
    const total = new Set([...interests1, ...interests2]);
    const interestScore = (shared.length / total.size) * 50;
    score += interestScore;
  }

  // Mood compatibility (up to 20 points)
  const compatibleMoods: Record<string, number> = {
    "Curious-Curious": 20,
    "Curious-Thoughtful": 18,
    "Playful-Playful": 20,
    "Playful-Social": 18,
    "Adventurous-Adventurous": 20,
    "Adventurous-Creative": 16,
    "Creative-Creative": 20,
    "Creative-Introspective": 14,
    "Social-Social": 20,
    "Chill-Chill": 20,
    "Chill-Introspective": 15,
  };

  if (agent1.current_mood && agent2.current_mood) {
    const pair1 = `${agent1.current_mood}-${agent2.current_mood}`;
    const pair2 = `${agent2.current_mood}-${agent1.current_mood}`;
    score += compatibleMoods[pair1] || compatibleMoods[pair2] || 10;
  }

  // Bio similarity bonus (up to 15 points)
  const bio1 = (agent1.bio || "").toLowerCase();
  const bio2 = (agent2.bio || "").toLowerCase();

  if (bio1 && bio2) {
    const stopWords = new Set(["the", "a", "an", "is", "are", "i", "and", "or", "to", "for"]);
    const words1 = new Set(bio1.split(/\s+/).filter((w) => !stopWords.has(w) && w.length > 2));
    const words2 = new Set(bio2.split(/\s+/).filter((w) => !stopWords.has(w) && w.length > 2));
    const commonWords = [...words1].filter((w) => words2.has(w));
    score += Math.min(commonWords.length * 3, 15);
  }

  // Activity bonus (up to 15 points)
  if (agent1.updated_at && agent2.updated_at) {
    score += 15;
  }

  return Math.min(score, 100);
}

/**
 * Get shared interests between two agents
 */
export function getSharedInterests(agent1: Agent, agent2: Agent): string[] {
  const interests1 = new Set(agent1.interests || []);
  const interests2 = new Set(agent2.interests || []);
  return [...interests1].filter((x) => interests2.has(x));
}
