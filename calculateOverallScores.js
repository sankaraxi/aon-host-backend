function calculateOverallScores(data) {
    const evaluationDetails = data.EvaluationDetails;
  
  // Group the scores by category
  const scoresByCategory = {
    Essential: [],
    Efficiency: [],
    Required: []
  };
  
  // Collect scores for each category
  evaluationDetails.forEach(item => {
    if (scoresByCategory[item.category] !== undefined) {
      scoresByCategory[item.category].push(item.score);
    }
  });
  
  // Calculate the sum of scores for each category
  const essentialSum = scoresByCategory.Essential.reduce((sum, score) => sum + score, 0);
  const efficiencySum = scoresByCategory.Efficiency.reduce((sum, score) => sum + score, 0);
  const requiredSum = scoresByCategory.Required.reduce((sum, score) => sum + score, 0);
  
  // Calculate the overall scores according to the specified weights
  // Essential: Convert to 40%
  const maxEssentialPoints = scoresByCategory.Essential.length * 5; // Each test case holds 5 points
  const overallEssentialScore = (essentialSum / maxEssentialPoints) * 40;
  
  // Efficiency: Convert to 40%
  const maxEfficiencyPoints = 25; // One test case holds 5 points, another holds 20 points
  const overallEfficiencyScore = (efficiencySum / maxEfficiencyPoints) * 40;
  
  // Required: Convert to 20%
  const maxRequiredPoints = scoresByCategory.Required.length * 5; // Each test case holds 5 points
  const overallRequiredScore = (requiredSum / maxRequiredPoints) * 20;
  
  // Calculate the total score
  const totalScore = overallEssentialScore + overallEfficiencyScore + overallRequiredScore;
  
  // Round all scores to 2 decimal places for readability
  return {
    AvgLoadTime: data.AvgLoadTime,
    OverallEssentialScore: parseFloat(overallEssentialScore.toFixed(2)),
    OverallEfficiencyScore: parseFloat(overallEfficiencyScore.toFixed(2)),
    OverallRequiredScore: parseFloat(overallRequiredScore.toFixed(2)),
    TotalScore: parseFloat(totalScore.toFixed(2))
  };
  }
  
  module.exports = { calculateOverallScores };