const { addDays } = require('./dates');

/**
 * Days in a row a habit was done, counting back from today. While today is not
 * ticked yet the streak is still alive, so counting starts from yesterday.
 * @param {Set<string>} doneDates dates ('YYYY-MM-DD') when the habit was done
 * @param {string} today
 */
function currentStreak(doneDates, today) {
  let day = doneDates.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (doneDates.has(day)) {
    count += 1;
    day = addDays(day, -1);
  }
  return count;
}

module.exports = { currentStreak };
