import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Builds and downloads a clean, user-friendly cricket scorecard PDF.
 *
 * Includes:
 * - Match summary
 * - Innings summary
 * - Batting scorecard
 * - Extras
 * - Bowling scorecard
 * - Partnerships
 * - Fall of wickets
 */
export function exportMatchPdf({ match, innings, players }) {
  const safePlayers = Array.isArray(players) ? players : [];
  const safeInnings = Array.isArray(innings) ? innings : [];

  const name = (id) => {
    if (!id) return '—';

    return (
      safePlayers.find((p) => p.id === id)?.name ||
      '—'
    );
  };

  const shortName = (id) => {
    if (!id) return '—';

    const player = safePlayers.find((p) => p.id === id);

    if (!player?.name) return '—';

    const parts = player.name.trim().split(/\s+/);

    if (parts.length === 1) return parts[0];

    return `${parts[0]} ${parts[parts.length - 1]}`;
  };

  const doc = new jsPDF('p', 'mm', 'a4');

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  /*
   * ---------------------------------------------------------
   * COLORS
   * ---------------------------------------------------------
   */

  const COLORS = {
    green: [15, 81, 50],
    lightGreen: [232, 247, 239],
    darkGreen: [16, 110, 67],

    blue: [30, 58, 138],
    lightBlue: [238, 243, 255],

    orange: [234, 119, 24],
    lightOrange: [255, 245, 230],

    red: [185, 28, 28],
    lightRed: [254, 242, 242],

    dark: [30, 30, 30],
    gray: [100, 100, 100],
    lightGray: [245, 247, 248],
    border: [220, 225, 228],
    white: [255, 255, 255],
  };

  /*
   * ---------------------------------------------------------
   * HELPERS
   * ---------------------------------------------------------
   */

  const setText = (size, color = COLORS.dark) => {
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  const drawSectionTitle = (
    title,
    y,
    color = COLORS.green,
    subtitle = null
  ) => {
    const height = subtitle ? 15 : 11;

    doc.setFillColor(...color);
    doc.roundedRect(
      margin,
      y,
      contentWidth,
      height,
      2,
      2,
      'F'
    );

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.white);
    doc.text(title, margin + 5, y + 7);

    if (subtitle) {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.text(
        subtitle,
        margin + 5,
        y + 12
      );
    }

    return y + height + 4;
  };

  const drawInfoBox = (
    label,
    value,
    x,
    y,
    width,
    height = 18
  ) => {
    doc.setFillColor(...COLORS.lightGray);
    doc.setDrawColor(...COLORS.border);

    doc.roundedRect(
      x,
      y,
      width,
      height,
      2,
      2,
      'FD'
    );

    setText(7.5, COLORS.gray);

    doc.text(
      label.toUpperCase(),
      x + 4,
      y + 6
    );

    setText(10, COLORS.dark);

    doc.setFont('helvetica', 'bold');

    const textValue = String(value ?? '—');

    doc.text(
      textValue,
      x + 4,
      y + 13
    );

    doc.setFont('helvetica', 'normal');
  };

  const ensureSpace = (requiredHeight) => {
    if (y + requiredHeight > pageHeight - 18) {
      doc.addPage();
      y = 18;

      drawPageHeader();
    }
  };

  const drawPageHeader = () => {
    if (doc.internal.getNumberOfPages() === 1) {
      return;
    }

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.green);

    doc.text(
      `${match.team1_short || match.team1_name} vs ${
        match.team2_short || match.team2_name
      }`,
      margin,
      10
    );

    doc.setDrawColor(...COLORS.border);

    doc.line(
      margin,
      12,
      pageWidth - margin,
      12
    );

    doc.setFont('helvetica', 'normal');
  };

  const addFooter = () => {
    const totalPages =
      doc.internal.getNumberOfPages();

    for (let page = 1; page <= totalPages; page++) {
      doc.setPage(page);

      doc.setDrawColor(...COLORS.border);

      doc.line(
        margin,
        pageHeight - 12,
        pageWidth - margin,
        pageHeight - 12
      );

      doc.setFontSize(7);
      doc.setTextColor(...COLORS.gray);

      doc.text(
        'Cricket Scorecard',
        margin,
        pageHeight - 7
      );

      doc.text(
        `Page ${page} of ${totalPages}`,
        pageWidth - margin,
        pageHeight - 7,
        { align: 'right' }
      );
    }
  };

  /*
   * ---------------------------------------------------------
   * START PDF
   * ---------------------------------------------------------
   */

  let y = 18;

  /*
   * MAIN MATCH HEADER
   */

  doc.setFillColor(...COLORS.green);

  doc.roundedRect(
    margin,
    y,
    contentWidth,
    38,
    4,
    4,
    'F'
  );

  setText(19, COLORS.white);

  doc.setFont('helvetica', 'bold');

  doc.text(
    `${match.team1_name || 'Team 1'} vs ${
      match.team2_name || 'Team 2'
    }`,
    pageWidth / 2,
    y + 12,
    { align: 'center' }
  );

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  doc.text(
    `${match.overs_limit || '—'}-over match`,
    pageWidth / 2,
    y + 19,
    { align: 'center' }
  );

  if (match.venue) {
    doc.text(
      match.venue,
      pageWidth / 2,
      y + 25,
      { align: 'center' }
    );
  }

  if (match.result_text) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);

    doc.text(
      match.result_text,
      pageWidth / 2,
      y + 32,
      { align: 'center' }
    );

    doc.setFont('helvetica', 'normal');
  }

  y += 45;

  /*
   * MATCH INFORMATION
   */

  const boxGap = 4;
  const boxWidth =
    (contentWidth - boxGap * 2) / 3;

  drawInfoBox(
    'Match type',
    match.match_type || 'Cricket',
    margin,
    y,
    boxWidth
  );

  drawInfoBox(
    'Overs',
    match.overs_limit || '—',
    margin + boxWidth + boxGap,
    y,
    boxWidth
  );

  drawInfoBox(
    'Venue',
    match.venue || '—',
    margin + (boxWidth + boxGap) * 2,
    y,
    boxWidth
  );

  y += 25;

  /*
   * ---------------------------------------------------------
   * EACH INNINGS
   * ---------------------------------------------------------
   */

  safeInnings.forEach((inn, idx) => {
    const inningsData = inn?.innings || {};

    const totalRuns =
      Number(inningsData.total_runs || 0);

    const totalWickets =
      Number(inningsData.total_wickets || 0);

    const overs =
      inn?.overs ||
      `${Math.floor(
        Number(inningsData.total_balls || 0) / 6
      )}.${Number(inningsData.total_balls || 0) % 6}`;

    const runRate =
      inn?.runRate !== undefined &&
      inn?.runRate !== null
        ? Number(inn.runRate).toFixed(2)
        : inningsData.total_balls > 0
        ? (
            totalRuns /
            (Number(inningsData.total_balls) / 6)
          ).toFixed(2)
        : '0.00';

    const battingTeam =
      inningsData.batting_team_id
        ? name(inningsData.batting_team_id)
        : `Innings ${idx + 1}`;

    /*
     * INNINGS HEADER
     */

    ensureSpace(30);

    y = drawSectionTitle(
      `INNINGS ${idx + 1}`,
      y,
      COLORS.green,
      battingTeam
    );

    /*
     * SCORE SUMMARY BOX
     */

    const scoreBoxWidth =
      (contentWidth - 8) / 3;

    doc.setFillColor(...COLORS.lightGreen);
    doc.setDrawColor(...COLORS.border);

    doc.roundedRect(
      margin,
      y,
      scoreBoxWidth,
      21,
      2,
      2,
      'FD'
    );

    setText(7.5, COLORS.gray);
    doc.text(
      'SCORE',
      margin + 5,
      y + 7
    );

    setText(15, COLORS.green);
    doc.setFont('helvetica', 'bold');

    doc.text(
      `${totalRuns}/${totalWickets}`,
      margin + 5,
      y + 16
    );

    doc.setFont('helvetica', 'normal');

    doc.setFillColor(...COLORS.lightBlue);

    doc.roundedRect(
      margin + scoreBoxWidth + 4,
      y,
      scoreBoxWidth,
      21,
      2,
      2,
      'F'
    );

    setText(7.5, COLORS.gray);

    doc.text(
      'OVERS',
      margin + scoreBoxWidth + 9,
      y + 7
    );

    setText(15, COLORS.blue);
    doc.setFont('helvetica', 'bold');

    doc.text(
      String(overs),
      margin + scoreBoxWidth + 9,
      y + 16
    );

    doc.setFont('helvetica', 'normal');

    doc.setFillColor(...COLORS.lightOrange);

    doc.roundedRect(
      margin + (scoreBoxWidth + 4) * 2,
      y,
      scoreBoxWidth,
      21,
      2,
      2,
      'F'
    );

    setText(7.5, COLORS.gray);

    doc.text(
      'RUN RATE',
      margin + (scoreBoxWidth + 4) * 2 + 5,
      y + 7
    );

    setText(15, COLORS.orange);
    doc.setFont('helvetica', 'bold');

    doc.text(
      String(runRate),
      margin + (scoreBoxWidth + 4) * 2 + 5,
      y + 16
    );

    doc.setFont('helvetica', 'normal');

    y += 27;

    /*
     * -------------------------------------------------------
     * BATTING
     * -------------------------------------------------------
     */

    ensureSpace(45);

    y = drawSectionTitle(
      'BATTING',
      y,
      COLORS.green,
      'Batting scorecard'
    );

    const battingRows =
      Array.isArray(inn?.battingCard)
        ? inn.battingCard
        : [];

    if (battingRows.length > 0) {
      autoTable(doc, {
        startY: y,

        head: [[
          'Batsman',
          'R',
          'B',
          '4s',
          '6s',
          'SR',
          'Dismissal'
        ]],

        body: battingRows.map((b) => [
          name(b.player_id),
          b.runs ?? 0,
          b.balls ?? 0,
          b.fours ?? 0,
          b.sixes ?? 0,
          b.strike_rate ?? '0.00',
          b.is_out
            ? `${b.how_out || 'out'}${
                b.fielder_id
                  ? ` (${shortName(b.fielder_id)})`
                  : ''
              }`
            : 'Not out',
        ]),

        margin: {
          left: margin,
          right: margin,
        },

        styles: {
          fontSize: 8,
          cellPadding: 2.5,
          valign: 'middle',
        },

        headStyles: {
          fillColor: COLORS.green,
          textColor: COLORS.white,
          fontStyle: 'bold',
          fontSize: 8,
        },

        alternateRowStyles: {
          fillColor: [248, 250, 249],
        },

        columnStyles: {
          0: { cellWidth: 40 },
          1: { halign: 'center', cellWidth: 12 },
          2: { halign: 'center', cellWidth: 12 },
          3: { halign: 'center', cellWidth: 12 },
          4: { halign: 'center', cellWidth: 12 },
          5: { halign: 'center', cellWidth: 17 },
          6: { cellWidth: 'auto' },
        },

        theme: 'grid',
      });

      y = doc.lastAutoTable.finalY + 5;
    } else {
      setText(9, COLORS.gray);

      doc.text(
        'No batting data available.',
        margin,
        y + 5
      );

      y += 12;
    }

    /*
     * -------------------------------------------------------
     * EXTRAS
     * -------------------------------------------------------
     */

    ensureSpace(24);

    const wide =
      Number(inningsData.extras_wide || 0);

    const noball =
      Number(inningsData.extras_noball || 0);

    const bye =
      Number(inningsData.extras_bye || 0);

    const legbye =
      Number(inningsData.extras_legbye || 0);

    const penalty =
      Number(inningsData.extras_penalty || 0);

    const extrasTotal =
      wide +
      noball +
      bye +
      legbye +
      penalty;

    doc.setFillColor(...COLORS.lightOrange);
    doc.setDrawColor(...COLORS.border);

    doc.roundedRect(
      margin,
      y,
      contentWidth,
      19,
      2,
      2,
      'FD'
    );

    setText(9, COLORS.orange);

    doc.setFont('helvetica', 'bold');

    doc.text(
      `EXTRAS  ${extrasTotal}`,
      margin + 5,
      y + 7
    );

    setText(8.5, COLORS.gray);

    doc.setFont('helvetica', 'normal');

    doc.text(
      `Wd ${wide}   ·   Nb ${noball}   ·   B ${bye}   ·   Lb ${legbye}${
        penalty ? `   ·   P ${penalty}` : ''
      }`,
      margin + 5,
      y + 14
    );

    y += 25;

    /*
     * -------------------------------------------------------
     * BOWLING
     * -------------------------------------------------------
     */

    ensureSpace(45);

    y = drawSectionTitle(
      'BOWLING',
      y,
      COLORS.blue,
      'Bowling scorecard'
    );

    const bowlingRows =
      Array.isArray(inn?.bowlingCard)
        ? inn.bowlingCard
        : [];

    if (bowlingRows.length > 0) {
      autoTable(doc, {
        startY: y,

        head: [[
          'Bowler',
          'O',
          'M',
          'R',
          'W',
          'Econ'
        ]],

        body: bowlingRows.map((b) => [
          name(b.player_id),
          b.overs ?? '0.0',
          b.maidens ?? 0,
          b.runs ?? 0,
          b.wickets ?? 0,
          b.economy ?? '0.00',
        ]),

        margin: {
          left: margin,
          right: margin,
        },

        styles: {
          fontSize: 8.5,
          cellPadding: 2.5,
          valign: 'middle',
        },

        headStyles: {
          fillColor: COLORS.blue,
          textColor: COLORS.white,
          fontStyle: 'bold',
        },

        alternateRowStyles: {
          fillColor: [248, 249, 253],
        },

        columnStyles: {
          0: { cellWidth: 65 },
          1: { halign: 'center' },
          2: { halign: 'center' },
          3: { halign: 'center' },
          4: { halign: 'center' },
          5: { halign: 'center' },
        },

        theme: 'grid',
      });

      y = doc.lastAutoTable.finalY + 6;
    } else {
      setText(9, COLORS.gray);

      doc.text(
        'No bowling data available.',
        margin,
        y + 5
      );

      y += 12;
    }

    /*
     * -------------------------------------------------------
     * PARTNERSHIPS
     * -------------------------------------------------------
     */

    ensureSpace(45);

    y = drawSectionTitle(
      'PARTNERSHIPS',
      y,
      COLORS.orange,
      'Batting partnerships'
    );

    const partnerships =
      Array.isArray(inn?.partnerships)
        ? inn.partnerships
        : [];

    if (partnerships.length > 0) {
      autoTable(doc, {
        startY: y,

        head: [[
          '#',
          'Batsman 1',
          'Batsman 2',
          'Runs',
          'Balls',
          'Status'
        ]],

        body: partnerships.map((p) => [
          p.partnership_no ?? '—',
          name(p.batsman1_id),
          name(p.batsman2_id),
          p.runs ?? 0,
          p.balls ?? 0,
          p.is_current
            ? 'Current'
            : 'Completed',
        ]),

        margin: {
          left: margin,
          right: margin,
        },

        styles: {
          fontSize: 8.5,
          cellPadding: 2.5,
          valign: 'middle',
        },

        headStyles: {
          fillColor: COLORS.orange,
          textColor: COLORS.white,
          fontStyle: 'bold',
        },

        alternateRowStyles: {
          fillColor: [255, 250, 243],
        },

        columnStyles: {
          0: { halign: 'center', cellWidth: 12 },
          1: { cellWidth: 45 },
          2: { cellWidth: 45 },
          3: { halign: 'center', cellWidth: 18 },
          4: { halign: 'center', cellWidth: 18 },
          5: { halign: 'center' },
        },

        theme: 'grid',
      });

      y = doc.lastAutoTable.finalY + 6;
    } else {
      doc.setFillColor(...COLORS.lightGray);
      doc.setDrawColor(...COLORS.border);

      doc.roundedRect(
        margin,
        y,
        contentWidth,
        15,
        2,
        2,
        'FD'
      );

      setText(8.5, COLORS.gray);

      doc.text(
        totalRuns > 0
          ? 'Partnership information is not available for this innings.'
          : 'No partnerships recorded.',
        margin + 5,
        y + 9
      );

      y += 21;
    }

    /*
     * -------------------------------------------------------
     * FALL OF WICKETS
     * -------------------------------------------------------
     */

    ensureSpace(45);

    y = drawSectionTitle(
      'FALL OF WICKETS',
      y,
      COLORS.red,
      'Wickets lost during the innings'
    );

    const fallOfWickets =
      Array.isArray(inn?.fallOfWickets)
        ? inn.fallOfWickets
        : [];

    if (fallOfWickets.length > 0) {
      autoTable(doc, {
        startY: y,

        head: [[
          'Wicket',
          'Score',
          'Over',
          'Batsman',
          'How Out'
        ]],

        body: fallOfWickets.map((w) => [
          w.wicket_no ?? '—',
          w.score ?? 0,
          w.overs ?? '—',
          name(w.player_id),
          `${w.how_out || 'out'}${
            w.fielder_id
              ? ` (${shortName(w.fielder_id)})`
              : ''
          }`,
        ]),

        margin: {
          left: margin,
          right: margin,
        },

        styles: {
          fontSize: 8.5,
          cellPadding: 2.5,
          valign: 'middle',
        },

        headStyles: {
          fillColor: COLORS.red,
          textColor: COLORS.white,
          fontStyle: 'bold',
        },

        alternateRowStyles: {
          fillColor: [255, 248, 248],
        },

        columnStyles: {
          0: { halign: 'center', cellWidth: 18 },
          1: { halign: 'center', cellWidth: 22 },
          2: { halign: 'center', cellWidth: 25 },
          3: { cellWidth: 48 },
          4: { cellWidth: 'auto' },
        },

        theme: 'grid',
      });

      y = doc.lastAutoTable.finalY + 8;
    } else {
      doc.setFillColor(...COLORS.lightGreen);
      doc.setDrawColor(...COLORS.border);

      doc.roundedRect(
        margin,
        y,
        contentWidth,
        15,
        2,
        2,
        'FD'
      );

      setText(9, COLORS.darkGreen);

      doc.setFont('helvetica', 'bold');

      doc.text(
        totalWickets === 0
          ? '✓ No wickets lost'
          : 'No fall-of-wickets data available.',
        margin + 5,
        y + 9
      );

      doc.setFont('helvetica', 'normal');

      y += 21;
    }

    /*
     * SPACE BETWEEN INNINGS
     */

    if (idx < safeInnings.length - 1) {
      ensureSpace(15);

      doc.setDrawColor(...COLORS.border);

      doc.line(
        margin,
        y,
        pageWidth - margin,
        y
      );

      y += 10;
    }
  });

  /*
   * ---------------------------------------------------------
   * FINAL MATCH RESULT
   * ---------------------------------------------------------
   */

  if (match.result_text) {
    ensureSpace(35);

    y = drawSectionTitle(
      'MATCH RESULT',
      y,
      COLORS.darkGreen
    );

    doc.setFillColor(...COLORS.lightGreen);
    doc.setDrawColor(...COLORS.border);

    doc.roundedRect(
      margin,
      y,
      contentWidth,
      22,
      3,
      3,
      'FD'
    );

    setText(12, COLORS.darkGreen);

    doc.setFont('helvetica', 'bold');

    const resultLines = doc.splitTextToSize(
      match.result_text,
      contentWidth - 10
    );

    doc.text(
      resultLines,
      pageWidth / 2,
      y + 9,
      { align: 'center' }
    );

    doc.setFont('helvetica', 'normal');

    y += 29;
  }

  /*
   * ---------------------------------------------------------
   * FOOTER
   * ---------------------------------------------------------
   */

  addFooter();

  /*
   * ---------------------------------------------------------
   * DOWNLOAD
   * ---------------------------------------------------------
   */

  const team1 =
    match.team1_short ||
    match.team1_name ||
    'Team1';

  const team2 =
    match.team2_short ||
    match.team2_name ||
    'Team2';

  const cleanFileName = `${team1}-vs-${team2}-scorecard`
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  doc.save(`${cleanFileName}.pdf`);
}
