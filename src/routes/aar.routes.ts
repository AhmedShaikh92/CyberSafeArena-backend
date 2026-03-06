import { Router, Request, Response } from 'express';
import { AfterActionReview } from '../models/AfterActionReview';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Get AAR for a specific game
router.get('/:gameId', async (req: Request, res: Response): Promise<void> => {
  try {
    const aar = await AfterActionReview.findOne({ gameId: req.params.gameId });

    if (!aar) {
      res.status(404).json({ error: 'After Action Review not found' });
      return;
    }

    res.json({ aar });
  } catch (error) {
    console.error('[AAR] Get AAR error:', error);
    res.status(500).json({ error: 'Failed to fetch After Action Review' });
  }
});

// Get user's AAR history
router.get('/history/user', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Query AARs where this user participated
    // This would require a Game model to track which users were in which games
    // For now, return empty history
    res.json({
      aars: [],
      total: 0,
      userId,
    });
  } catch (error) {
    console.error('[AAR] Get user history error:', error);
    res.status(500).json({ error: 'Failed to fetch AAR history' });
  }
});

// Create AAR (internal endpoint, called after game ends)
router.post('/:gameId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { redTeamSummary, blueTeamSummary, keyInsights, improvementAreas } = req.body;

    const existingAAR = await AfterActionReview.findOne({ gameId: req.params.gameId });

    if (existingAAR) {
      res.status(409).json({ error: 'AAR already exists for this game' });
      return;
    }

    const aar = new AfterActionReview({
      gameId: req.params.gameId,
      redTeamSummary,
      blueTeamSummary,
      keyInsights,
      improvementAreas,
    });

    await aar.save();

    res.status(201).json({ aar });
  } catch (error) {
    console.error('[AAR] Create AAR error:', error);
    res.status(500).json({ error: 'Failed to create After Action Review' });
  }
});

// Get AAR summary statistics
router.get('/stats/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    const totalAARs = await AfterActionReview.countDocuments();

    const avgRedTeamScore = await AfterActionReview.aggregate([
      {
        $group: {
          _id: null,
          avgScore: { $avg: '$redTeamSummary.performanceScore' },
        },
      },
    ]);

    const avgBlueTeamScore = await AfterActionReview.aggregate([
      {
        $group: {
          _id: null,
          avgScore: { $avg: '$blueTeamSummary.performanceScore' },
        },
      },
    ]);

    res.json({
      totalGames: totalAARs,
      averageRedTeamScore: avgRedTeamScore[0]?.avgScore || 0,
      averageBlueTeamScore: avgBlueTeamScore[0]?.avgScore || 0,
    });
  } catch (error) {
    console.error('[AAR] Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export default router;
