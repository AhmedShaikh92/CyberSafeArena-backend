import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { generateBriefing } from '../services/briefing';

const router = Router();

// ─── Helper: resolve a game object from gameManager regardless of method name ─
function resolveGame(gameManager: any, gameId: string) {
  // Try the most specific method first, fall back to getGameState
  if (typeof gameManager.getGame === 'function') {
    return gameManager.getGame(gameId);
  }
  if (typeof gameManager.getGameState === 'function') {
    return gameManager.getGameState(gameId);
  }
  return null;
}

// GET /games/active
router.get('/active', (req: Request, res: Response): void => {
  try {
    const gameManager = req.app.get('gameManager');
    if (!gameManager) {
      res.status(500).json({ error: 'Game manager not initialized' });
      return;
    }
    const games = gameManager.getAllGames?.() ?? [];
    res.json({ games });
  } catch (error) {
    console.error('[Game] List games error:', error);
    res.status(500).json({ error: 'Failed to list games' });
  }
});

// GET /games/history/user  ← MUST be before /:gameId or Express matches 'history' as gameId
router.get('/history/user', authenticateToken, (req: Request, res: Response): void => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    res.json({ games: [], total: 0 });
  } catch (error) {
    console.error('[Game] Get history error:', error);
    res.status(500).json({ error: 'Failed to fetch game history' });
  }
});

// GET /games/:gameId/briefing
router.get('/:gameId/briefing', authenticateToken, (req: Request, res: Response): void => {
  try {
    const gameManager = req.app.get('gameManager');
    if (!gameManager) {
      res.status(500).json({ error: 'Game manager not initialized' });
      return;
    }

    const game = resolveGame(gameManager, req.params.gameId as string);

    if (!game) {
      console.error(`[Game] Briefing: game not found for id=${req.params.gameId}`);
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Determine role — handle both Set and Array for red/blue team members
    let userRole: 'red_team' | 'blue_team' = 'blue_team';
    const redTeam = game.redTeamUsers ?? game.redTeam ?? game.players?.redTeam;
    if (redTeam) {
      const isRed = typeof redTeam.has === 'function'
        ? redTeam.has(userId)
        : Array.isArray(redTeam) && redTeam.some((u: any) => (u?.userId ?? u?.id ?? u) === userId);
      if (isRed) userRole = 'red_team';
    }

    // scenario may be nested as game.scenario or game.state.scenario
    const scenario = game.scenario ?? game.state?.scenario;
    if (!scenario) {
      console.error(`[Game] Briefing: scenario missing on game`, JSON.stringify(Object.keys(game)));
      res.status(500).json({ error: 'Game scenario not found' });
      return;
    }

    const briefing = generateBriefing(scenario, userRole);
    res.json({ briefing });
  } catch (error) {
    console.error('[Game] Get briefing error:', error);
    res.status(500).json({ error: 'Failed to fetch briefing', detail: (error as Error).message });
  }
});

// GET /games/:gameId
router.get('/:gameId', (req: Request, res: Response): void => {
  try {
    const gameManager = req.app.get('gameManager');
    if (!gameManager) {
      res.status(500).json({ error: 'Game manager not initialized' });
      return;
    }
    const gameId = req.params.gameId as string;
    const state = gameManager.getGameState?.(gameId)
      ?? gameManager.getGame?.(gameId);

    if (!state) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    res.json({ state });
  } catch (error) {
    console.error('[Game] Get game state error:', error);
    res.status(500).json({ error: 'Failed to fetch game state' });
  }
});

export default router;