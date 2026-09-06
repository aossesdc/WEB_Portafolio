function calculateConsumedPercentage(ticket) {
  const effectiveElapsed = Math.max((ticket.elapsedHours || 0) - (ticket.pausedHours || 0), 0);
  const totalContract = Math.max(ticket.contractHours || 1, 1);
  return Math.min((effectiveElapsed / totalContract) * 100, 100);
}

function getRiskLevel(percentage) {
  if (percentage >= 85) return 'Crítico';
  if (percentage >= 60) return 'Medio';
  return 'Bajo';
}

function getRiskClass(percentage) {
  if (percentage >= 85) return 'critical';
  if (percentage >= 60) return 'medium';
  return 'low';
}

module.exports = {
  calculateConsumedPercentage,
  getRiskLevel,
  getRiskClass
};
