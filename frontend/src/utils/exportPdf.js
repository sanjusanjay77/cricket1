import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/** Builds and downloads a full scorecard PDF for a completed (or in-progress) match. */
export function exportMatchPdf({ match, innings, players }) {
  const name = (id) => players.find(p => p.id === id)?.name || '—';
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.setTextColor(15, 81, 50);
  doc.text(`${match.team1_name} vs ${match.team2_name}`, 14, 18);

  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(`${match.overs_limit}-over match${match.venue ? ' · ' + match.venue : ''}`, 14, 25);

  if (match.result_text) {
    doc.setFontSize(12);
    doc.setTextColor(16, 150, 90);
    doc.text(match.result_text, 14, 33);
  }

  let y = match.result_text ? 41 : 33;

  innings.forEach((inn, idx) => {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 20);
    doc.text(`Innings ${idx + 1}  —  ${inn.innings.total_runs}/${inn.innings.total_wickets}  (${inn.overs} overs)`, 14, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [['Batsman', 'R', 'B', '4s', '6s', 'SR', 'Dismissal']],
      body: inn.battingCard.map(b => [
        name(b.player_id), b.runs, b.balls, b.fours, b.sixes, b.strike_rate,
        b.is_out ? `${b.how_out}${b.fielder_id ? ' (' + name(b.fielder_id) + ')' : ''}` : 'not out',
      ]),
      styles: { fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: [16, 150, 90] },
      margin: { left: 14, right: 14 },
      theme: 'striped',
    });
    y = doc.lastAutoTable.finalY + 4;

    const extrasTotal = inn.innings.extras_wide + inn.innings.extras_noball + inn.innings.extras_bye + inn.innings.extras_legbye + inn.innings.extras_penalty;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Extras: ${extrasTotal} (wd ${inn.innings.extras_wide}, nb ${inn.innings.extras_noball}, b ${inn.innings.extras_bye}, lb ${inn.innings.extras_legbye})`, 14, y);
    y += 7;

    autoTable(doc, {
      startY: y,
      head: [['Bowler', 'O', 'M', 'R', 'W', 'Econ']],
      body: inn.bowlingCard.map(b => [name(b.player_id), b.overs, b.maidens, b.runs, b.wickets, b.economy]),
      styles: { fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 138] },
      margin: { left: 14, right: 14 },
      theme: 'striped',
    });
    y = doc.lastAutoTable.finalY + 10;
  });

  doc.save(`${match.team1_short}-vs-${match.team2_short}-scorecard.pdf`);
}
