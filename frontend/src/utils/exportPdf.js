/**
 * Builds and downloads a professional cricket scorecard PDF.
 *
 * Design:
 * - Clean white background
 * - Dark green primary color
 * - Neutral gray tables
 * - Minimal accent colors
 * - Professional tournament-style layout
 *
 * PDF libraries are loaded only when the user exports.
 */
export async function exportMatchPdf({
  match,
  innings,
  players,
}) {
  // Load PDF libraries only when required.
  const [{ default: jsPDF }, { default: autoTable }] =
    await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);

  const safePlayers = Array.isArray(players)
    ? players
    : [];

  const safeInnings = Array.isArray(innings)
    ? innings
    : [];

  /*
   * ============================================================
   * HELPERS
   * ============================================================
   */

  const findPlayer = (id) => {
    if (!id) return null;

    return safePlayers.find(
      (player) =>
        String(player.id) === String(id)
    );
  };

  const name = (id) => {
    const player = findPlayer(id);

    return player?.name || '—';
  };

  const shortName = (id) => {
    const player = findPlayer(id);

    if (!player?.name) return '—';

    const parts = player.name
      .trim()
      .split(/\s+/);

    if (parts.length === 1) {
      return parts[0];
    }

    return `${parts[0]} ${parts[parts.length - 1]}`;
  };

  const safeNumber = (value, fallback = 0) => {
    const number = Number(value);

    return Number.isFinite(number)
      ? number
      : fallback;
  };

  const formatNumber = (value) => {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return '0';
    }

    return Number.isInteger(number)
      ? String(number)
      : number.toFixed(2);
  };

  /*
   * ============================================================
   * PDF
   * ============================================================
   */

  const doc = new jsPDF(
    'p',
    'mm',
    'a4'
  );

  const pageWidth =
    doc.internal.pageSize.getWidth();

  const pageHeight =
    doc.internal.pageSize.getHeight();

  const margin = 14;

  const contentWidth =
    pageWidth - margin * 2;

  /*
   * ============================================================
   * PROFESSIONAL COLOR PALETTE
   * ============================================================
   *
   * Only a few colors are used.
   */

  const COLORS = {
    primary: [25, 82, 55],
    primaryDark: [18, 63, 42],
    primaryLight: [239, 246, 242],

    text: [35, 35, 35],
    textSecondary: [105, 105, 105],

    gray: [115, 115, 115],
    lightGray: [246, 247, 247],
    border: [218, 222, 220],

    white: [255, 255, 255],

    red: [170, 45, 45],
    redLight: [252, 244, 244],
  };

  /*
   * ============================================================
   * BASIC TEXT HELPERS
   * ============================================================
   */

  const setText = (
    size = 9,
    color = COLORS.text,
    style = 'normal'
  ) => {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.setFont(
      'helvetica',
      style
    );
  };

  /*
   * ============================================================
   * PAGE HEADER
   * ============================================================
   */

  const drawPageHeader = () => {
    if (
      doc.internal.getNumberOfPages() === 1
    ) {
      return;
    }

    const team1 =
      match.team1_short ||
      match.team1_name ||
      'Team 1';

    const team2 =
      match.team2_short ||
      match.team2_name ||
      'Team 2';

    setText(
      8,
      COLORS.primary,
      'bold'
    );

    doc.text(
      `${team1}  vs  ${team2}`,
      margin,
      9
    );

    setText(
      7,
      COLORS.gray,
      'normal'
    );

    doc.text(
      'CRICKET SCORECARD',
      pageWidth - margin,
      9,
      {
        align: 'right',
      }
    );

    doc.setDrawColor(
      ...COLORS.border
    );

    doc.line(
      margin,
      11,
      pageWidth - margin,
      11
    );
  };

  /*
   * ============================================================
   * FOOTER
   * ============================================================
   */

  const addFooter = () => {
    const totalPages =
      doc.internal.getNumberOfPages();

    for (
      let page = 1;
      page <= totalPages;
      page++
    ) {
      doc.setPage(page);

      doc.setDrawColor(
        ...COLORS.border
      );

      doc.line(
        margin,
        pageHeight - 12,
        pageWidth - margin,
        pageHeight - 12
      );

      setText(
        7,
        COLORS.gray,
        'normal'
      );

      doc.text(
        'Cricket Scorecard',
        margin,
        pageHeight - 7
      );

      doc.text(
        `Page ${page} of ${totalPages}`,
        pageWidth - margin,
        pageHeight - 7,
        {
          align: 'right',
        }
      );
    }
  };

  /*
   * ============================================================
   * SPACE MANAGEMENT
   * ============================================================
   */

  let y = 18;

  const ensureSpace = (
    requiredHeight
  ) => {
    if (
      y + requiredHeight >
      pageHeight - 18
    ) {
      doc.addPage();

      y = 18;

      drawPageHeader();
    }
  };

  /*
   * ============================================================
   * SECTION HEADER
   * ============================================================
   *
   * Clean green line + title instead of large colored box.
   */

  const drawSectionTitle = (
    title,
    subtitle = null
  ) => {
    ensureSpace(
      subtitle ? 18 : 14
    );

    doc.setFillColor(
      ...COLORS.primary
    );

    doc.rect(
      margin,
      y,
      2.5,
      subtitle ? 13 : 10,
      'F'
    );

    setText(
      11,
      COLORS.text,
      'bold'
    );

    doc.text(
      title,
      margin + 6,
      y + 6.5
    );

    if (subtitle) {
      setText(
        7.5,
        COLORS.gray,
        'normal'
      );

      doc.text(
        subtitle,
        margin + 6,
        y + 11.5
      );
    }

    y += subtitle
      ? 18
      : 14;
  };

  /*
   * ============================================================
   * INFORMATION BOX
   * ============================================================
   */

  const drawInfoBox = (
    label,
    value,
    x,
    width
  ) => {
    doc.setFillColor(
      ...COLORS.lightGray
    );

    doc.setDrawColor(
      ...COLORS.border
    );

    doc.roundedRect(
      x,
      y,
      width,
      17,
      1.5,
      1.5,
      'FD'
    );

    setText(
      6.8,
      COLORS.gray,
      'bold'
    );

    doc.text(
      String(label).toUpperCase(),
      x + 4,
      y + 5.5
    );

    setText(
      9,
      COLORS.text,
      'bold'
    );

    const displayValue =
      String(value ?? '—');

    const maxWidth =
      width - 8;

    const lines =
      doc.splitTextToSize(
        displayValue,
        maxWidth
      );

    doc.text(
      lines.slice(0, 1),
      x + 4,
      y + 12
    );
  };

  /*
   * ============================================================
   * MAIN MATCH HEADER
   * ============================================================
   */

  const team1 =
    match.team1_name ||
    match.team1_short ||
    'Team 1';

  const team2 =
    match.team2_name ||
    match.team2_short ||
    'Team 2';

  /*
   * Small top label
   */

  setText(
    8,
    COLORS.primary,
    'bold'
  );

  doc.text(
    'CRICKET SCORECARD',
    margin,
    y
  );

  y += 5;

  /*
   * Main title
   */

  setText(
    20,
    COLORS.text,
    'bold'
  );

  const matchTitle =
    `${team1}  vs  ${team2}`;

  doc.text(
    matchTitle,
    pageWidth / 2,
    y + 9,
    {
      align: 'center',
    }
  );

  y += 15;

  /*
   * Match details line
   */

  const matchType =
    match.match_type ||
    'Cricket';

  const oversText =
    match.overs_limit
      ? `${match.overs_limit} overs`
      : 'Overs —';

  const venueText =
    match.venue ||
    'Venue not specified';

  setText(
    8.5,
    COLORS.gray,
    'normal'
  );

  doc.text(
    `${matchType}  •  ${oversText}  •  ${venueText}`,
    pageWidth / 2,
    y,
    {
      align: 'center',
      maxWidth: contentWidth,
    }
  );

  y += 6;

  /*
   * Result
   */

  if (match.result_text) {
    setText(
      10,
      COLORS.primary,
      'bold'
    );

    const resultLines =
      doc.splitTextToSize(
        match.result_text,
        contentWidth - 20
      );

    doc.text(
      resultLines,
      pageWidth / 2,
      y + 2,
      {
        align: 'center',
      }
    );

    y +=
      resultLines.length * 4.5;
  }

  /*
   * Header separator
   */

  y += 5;

  doc.setDrawColor(
    ...COLORS.primary
  );

  doc.setLineWidth(0.7);

  doc.line(
    margin,
    y,
    pageWidth - margin,
    y
  );

  doc.setLineWidth(0.2);

  y += 9;

  /*
   * ============================================================
   * MATCH INFORMATION
   * ============================================================
   */

  const boxGap = 4;

  const boxWidth =
    (contentWidth - boxGap * 2) / 3;

  drawInfoBox(
    'Match Type',
    matchType,
    margin,
    boxWidth
  );

  drawInfoBox(
    'Overs',
    match.overs_limit || '—',
    margin + boxWidth + boxGap,
    boxWidth
  );

  drawInfoBox(
    'Venue',
    match.venue || '—',
    margin +
      (boxWidth + boxGap) * 2,
    boxWidth
  );

  y += 24;

  /*
   * ============================================================
   * INNINGS
   * ============================================================
   */

  safeInnings.forEach(
    (inn, idx) => {
      const inningsData =
        inn?.innings || {};

      const totalRuns =
        safeNumber(
          inningsData.total_runs
        );

      const totalWickets =
        safeNumber(
          inningsData.total_wickets
        );

      const totalBalls =
        safeNumber(
          inningsData.total_balls
        );

      const calculatedOvers =
        `${Math.floor(
          totalBalls / 6
        )}.${totalBalls % 6}`;

      const overs =
        inn?.overs ||
        calculatedOvers;

      let runRate = '0.00';

      if (
        inn?.runRate !== undefined &&
        inn?.runRate !== null
      ) {
        runRate =
          safeNumber(
            inn.runRate
          ).toFixed(2);
      } else if (
        totalBalls > 0
      ) {
        runRate =
          (
            totalRuns /
            (totalBalls / 6)
          ).toFixed(2);
      }

      const battingTeam =
        inningsData.batting_team_id
          ? name(
              inningsData.batting_team_id
            )
          : `Innings ${idx + 1}`;

      /*
       * ========================================================
       * INNINGS TITLE
       * ========================================================
       */

      ensureSpace(35);

      drawSectionTitle(
        `INNINGS ${idx + 1}`,
        battingTeam
      );

      /*
       * ========================================================
       * SCORE SUMMARY
       * ========================================================
       */

      const summaryGap = 4;

      const summaryWidth =
        (contentWidth -
          summaryGap * 2) /
        3;

      /*
       * SCORE
       */

      doc.setFillColor(
        ...COLORS.primaryLight
      );

      doc.setDrawColor(
        ...COLORS.border
      );

      doc.roundedRect(
        margin,
        y,
        summaryWidth,
        20,
        1.5,
        1.5,
        'FD'
      );

      setText(
        6.8,
        COLORS.gray,
        'bold'
      );

      doc.text(
        'SCORE',
        margin + 4,
        y + 6
      );

      setText(
        14,
        COLORS.primary,
        'bold'
      );

      doc.text(
        `${totalRuns}/${totalWickets}`,
        margin + 4,
        y + 15
      );

      /*
       * OVERS
       */

      const secondX =
        margin +
        summaryWidth +
        summaryGap;

      doc.setFillColor(
        ...COLORS.lightGray
      );

      doc.roundedRect(
        secondX,
        y,
        summaryWidth,
        20,
        1.5,
        1.5,
        'F'
      );

      setText(
        6.8,
        COLORS.gray,
        'bold'
      );

      doc.text(
        'OVERS',
        secondX + 4,
        y + 6
      );

      setText(
        14,
        COLORS.text,
        'bold'
      );

      doc.text(
        String(overs),
        secondX + 4,
        y + 15
      );

      /*
       * RUN RATE
       */

      const thirdX =
        secondX +
        summaryWidth +
        summaryGap;

      doc.setFillColor(
        ...COLORS.lightGray
      );

      doc.roundedRect(
        thirdX,
        y,
        summaryWidth,
        20,
        1.5,
        1.5,
        'F'
      );

      setText(
        6.8,
        COLORS.gray,
        'bold'
      );

      doc.text(
        'RUN RATE',
        thirdX + 4,
        y + 6
      );

      setText(
        14,
        COLORS.text,
        'bold'
      );

      doc.text(
        String(runRate),
        thirdX + 4,
        y + 15
      );

      y += 27;

      /*
       * ========================================================
       * BATTING
       * ========================================================
       */

      ensureSpace(45);

      drawSectionTitle(
        'BATTING',
        'Batting scorecard'
      );

      const battingRows =
        Array.isArray(
          inn?.battingCard
        )
          ? inn.battingCard
          : [];

      if (
        battingRows.length > 0
      ) {
        autoTable(doc, {
          startY: y,

          head: [[
            'Batsman',
            'R',
            'B',
            '4s',
            '6s',
            'SR',
            'Dismissal',
          ]],

          body:
            battingRows.map(
              (b) => [
                name(
                  b.player_id
                ),

                b.runs ?? 0,

                b.balls ?? 0,

                b.fours ?? 0,

                b.sixes ?? 0,

                b.strike_rate ??
                  '0.00',

                b.is_out
                  ? `${b.how_out || 'out'}${
                      b.fielder_id
                        ? ` (${shortName(
                            b.fielder_id
                          )})`
                        : ''
                    }`
                  : 'Not out',
              ]
            ),

          margin: {
            left: margin,
            right: margin,
          },

          styles: {
            fontSize: 8,
            cellPadding: 2.6,
            valign: 'middle',
            textColor:
              COLORS.text,
            lineColor:
              COLORS.border,
            lineWidth: 0.2,
          },

          headStyles: {
            fillColor:
              COLORS.primary,
            textColor:
              COLORS.white,
            fontStyle:
              'bold',
            fontSize: 8,
            halign: 'center',
          },

          bodyStyles: {
            fillColor:
              COLORS.white,
          },

          alternateRowStyles: {
            fillColor:
              COLORS.lightGray,
          },

          columnStyles: {
            0: {
              cellWidth: 40,
              fontStyle:
                'bold',
            },

            1: {
              halign: 'center',
              cellWidth: 12,
            },

            2: {
              halign: 'center',
              cellWidth: 12,
            },

            3: {
              halign: 'center',
              cellWidth: 12,
            },

            4: {
              halign: 'center',
              cellWidth: 12,
            },

            5: {
              halign: 'center',
              cellWidth: 17,
            },

            6: {
              cellWidth: 'auto',
            },
          },

          theme: 'grid',

          didParseCell: (
            data
          ) => {
            /*
             * Highlight runs slightly.
             */

            if (
              data.section ===
                'body' &&
              data.column.index === 1
            ) {
              data.cell.styles.fontStyle =
                'bold';
            }
          },
        });

        y =
          doc.lastAutoTable
            .finalY + 6;
      } else {
        setText(
          8.5,
          COLORS.gray
        );

        doc.text(
          'No batting data available.',
          margin,
          y + 5
        );

        y += 12;
      }

      /*
       * ========================================================
       * EXTRAS
       * ========================================================
       */

      ensureSpace(25);

      const wide =
        safeNumber(
          inningsData.extras_wide
        );

      const noball =
        safeNumber(
          inningsData.extras_noball
        );

      const bye =
        safeNumber(
          inningsData.extras_bye
        );

      const legbye =
        safeNumber(
          inningsData.extras_legbye
        );

      const penalty =
        safeNumber(
          inningsData.extras_penalty
        );

      const extrasTotal =
        wide +
        noball +
        bye +
        legbye +
        penalty;

      /*
       * Thin extras strip.
       */

      doc.setFillColor(
        ...COLORS.lightGray
      );

      doc.setDrawColor(
        ...COLORS.border
      );

      doc.roundedRect(
        margin,
        y,
        contentWidth,
        18,
        1.5,
        1.5,
        'FD'
      );

      setText(
        8,
        COLORS.primary,
        'bold'
      );

      doc.text(
        `EXTRAS  ${extrasTotal}`,
        margin + 5,
        y + 6.5
      );

      setText(
        7.5,
        COLORS.gray,
        'normal'
      );

      doc.text(
        `Wd ${wide}   •   Nb ${noball}   •   B ${bye}   •   Lb ${legbye}${
          penalty
            ? `   •   P ${penalty}`
            : ''
        }`,
        margin + 5,
        y + 13
      );

      y += 24;

      /*
       * ========================================================
       * BOWLING
       * ========================================================
       */

      ensureSpace(45);

      drawSectionTitle(
        'BOWLING',
        'Bowling scorecard'
      );

      const bowlingRows =
        Array.isArray(
          inn?.bowlingCard
        )
          ? inn.bowlingCard
          : [];

      if (
        bowlingRows.length > 0
      ) {
        autoTable(doc, {
          startY: y,

          head: [[
            'Bowler',
            'O',
            'M',
            'R',
            'W',
            'Econ',
          ]],

          body:
            bowlingRows.map(
              (b) => [
                name(
                  b.player_id
                ),

                b.overs ??
                  '0.0',

                b.maidens ??
                  0,

                b.runs ??
                  0,

                b.wickets ??
                  0,

                b.economy ??
                  '0.00',
              ]
            ),

          margin: {
            left: margin,
            right: margin,
          },

          styles: {
            fontSize: 8.5,
            cellPadding: 2.7,
            valign: 'middle',
            textColor:
              COLORS.text,
            lineColor:
              COLORS.border,
            lineWidth: 0.2,
          },

          headStyles: {
            fillColor:
              COLORS.primary,
            textColor:
              COLORS.white,
            fontStyle:
              'bold',
            fontSize: 8,
            halign: 'center',
          },

          bodyStyles: {
            fillColor:
              COLORS.white,
          },

          alternateRowStyles: {
            fillColor:
              COLORS.lightGray,
          },

          columnStyles: {
            0: {
              cellWidth: 65,
              fontStyle:
                'bold',
            },

            1: {
              halign: 'center',
            },

            2: {
              halign: 'center',
            },

            3: {
              halign: 'center',
            },

            4: {
              halign: 'center',
            },

            5: {
              halign: 'center',
            },
          },

          theme: 'grid',

          didParseCell: (
            data
          ) => {
            if (
              data.section ===
                'body' &&
              data.column.index === 4
            ) {
              data.cell.styles.fontStyle =
                'bold';
            }
          },
        });

        y =
          doc.lastAutoTable
            .finalY + 6;
      } else {
        setText(
          8.5,
          COLORS.gray
        );

        doc.text(
          'No bowling data available.',
          margin,
          y + 5
        );

        y += 12;
      }

      /*
       * ========================================================
       * PARTNERSHIPS
       * ========================================================
       */

      ensureSpace(45);

      drawSectionTitle(
        'PARTNERSHIPS',
        'Batting partnerships'
      );

      const partnerships =
        Array.isArray(
          inn?.partnerships
        )
          ? inn.partnerships
          : [];

      if (
        partnerships.length > 0
      ) {
        autoTable(doc, {
          startY: y,

          head: [[
            '#',
            'Batsman 1',
            'Batsman 2',
            'Runs',
            'Balls',
            'Status',
          ]],

          body:
            partnerships.map(
              (p) => [
                p.partnership_no ??
                  '—',

                name(
                  p.batsman1_id
                ),

                name(
                  p.batsman2_id
                ),

                p.runs ??
                  0,

                p.balls ??
                  0,

                p.is_current
                  ? 'Current'
                  : 'Completed',
              ]
            ),

          margin: {
            left: margin,
            right: margin,
          },

          styles: {
            fontSize: 8.5,
            cellPadding: 2.6,
            valign: 'middle',
            textColor:
              COLORS.text,
            lineColor:
              COLORS.border,
            lineWidth: 0.2,
          },

          headStyles: {
            fillColor:
              COLORS.primary,
            textColor:
              COLORS.white,
            fontStyle:
              'bold',
            halign: 'center',
          },

          bodyStyles: {
            fillColor:
              COLORS.white,
          },

          alternateRowStyles: {
            fillColor:
              COLORS.lightGray,
          },

          columnStyles: {
            0: {
              halign: 'center',
              cellWidth: 12,
            },

            1: {
              cellWidth: 45,
            },

            2: {
              cellWidth: 45,
            },

            3: {
              halign: 'center',
              cellWidth: 18,
            },

            4: {
              halign: 'center',
              cellWidth: 18,
            },

            5: {
              halign: 'center',
            },
          },

          theme: 'grid',
        });

        y =
          doc.lastAutoTable
            .finalY + 6;
      } else {
        doc.setFillColor(
          ...COLORS.lightGray
        );

        doc.setDrawColor(
          ...COLORS.border
        );

        doc.roundedRect(
          margin,
          y,
          contentWidth,
          15,
          1.5,
          1.5,
          'FD'
        );

        setText(
          8.5,
          COLORS.gray
        );

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
       * ========================================================
       * FALL OF WICKETS
       * ========================================================
       */

      ensureSpace(45);

      /*
       * Red is used ONLY here.
       */

      doc.setFillColor(
        ...COLORS.red
      );

      doc.rect(
        margin,
        y,
        2.5,
        13,
        'F'
      );

      setText(
        11,
        COLORS.text,
        'bold'
      );

      doc.text(
        'FALL OF WICKETS',
        margin + 6,
        y + 6.5
      );

      setText(
        7.5,
        COLORS.gray
      );

      doc.text(
        'Wickets lost during the innings',
        margin + 6,
        y + 11.5
      );

      y += 18;

      const fallOfWickets =
        Array.isArray(
          inn?.fallOfWickets
        )
          ? inn.fallOfWickets
          : [];

      if (
        fallOfWickets.length > 0
      ) {
        autoTable(doc, {
          startY: y,

          head: [[
            'Wkt',
            'Score',
            'Over',
            'Batsman',
            'How Out',
          ]],

          body:
            fallOfWickets.map(
              (w) => [
                w.wicket_no ??
                  '—',

                w.score ??
                  0,

                w.overs ??
                  '—',

                name(
                  w.player_id
                ),

                `${w.how_out || 'out'}${
                  w.fielder_id
                    ? ` (${shortName(
                        w.fielder_id
                      )})`
                    : ''
                }`,
              ]
            ),

          margin: {
            left: margin,
            right: margin,
          },

          styles: {
            fontSize: 8.5,
            cellPadding: 2.6,
            valign: 'middle',
            textColor:
              COLORS.text,
            lineColor:
              COLORS.border,
            lineWidth: 0.2,
          },

          headStyles: {
            fillColor:
              COLORS.red,
            textColor:
              COLORS.white,
            fontStyle:
              'bold',
            halign: 'center',
          },

          bodyStyles: {
            fillColor:
              COLORS.white,
          },

          alternateRowStyles: {
            fillColor:
              COLORS.redLight,
          },

          columnStyles: {
            0: {
              halign: 'center',
              cellWidth: 18,
            },

            1: {
              halign: 'center',
              cellWidth: 22,
            },

            2: {
              halign: 'center',
              cellWidth: 25,
            },

            3: {
              cellWidth: 48,
              fontStyle:
                'bold',
            },

            4: {
              cellWidth: 'auto',
            },
          },

          theme: 'grid',
        });

        y =
          doc.lastAutoTable
            .finalY + 8;
      } else {
        doc.setFillColor(
          ...COLORS.lightGray
        );

        doc.setDrawColor(
          ...COLORS.border
        );

        doc.roundedRect(
          margin,
          y,
          contentWidth,
          15,
          1.5,
          1.5,
          'FD'
        );

        setText(
          8.5,
          totalWickets === 0
            ? COLORS.primary
            : COLORS.gray,
          'bold'
        );

        doc.text(
          totalWickets === 0
            ? 'No wickets lost'
            : 'No fall-of-wickets data available.',
          margin + 5,
          y + 9
        );

        y += 21;
      }

      /*
       * ========================================================
       * BETWEEN INNINGS
       * ========================================================
       */

      if (
        idx <
        safeInnings.length - 1
      ) {
        ensureSpace(15);

        y += 2;

        doc.setDrawColor(
          ...COLORS.border
        );

        doc.setLineWidth(0.5);

        doc.line(
          margin,
          y,
          pageWidth - margin,
          y
        );

        doc.setLineWidth(0.2);

        y += 10;
      }
    }
  );

  /*
   * ============================================================
   * FINAL MATCH RESULT
   * ============================================================
   */

  if (match.result_text) {
    ensureSpace(35);

    /*
     * Clean result section.
     */

    drawSectionTitle(
      'MATCH RESULT'
    );

    doc.setFillColor(
      ...COLORS.primaryLight
    );

    doc.setDrawColor(
      ...COLORS.border
    );

    doc.roundedRect(
      margin,
      y,
      contentWidth,
      22,
      2,
      2,
      'FD'
    );

    setText(
      11,
      COLORS.primary,
      'bold'
    );

    const resultLines =
      doc.splitTextToSize(
        match.result_text,
        contentWidth - 16
      );

    doc.text(
      resultLines,
      pageWidth / 2,
      y + 9,
      {
        align: 'center',
      }
    );

    y += 29;
  }

  /*
   * ============================================================
   * FOOTER
   * ============================================================
   */

  addFooter();

  /*
   * ============================================================
   * FILE NAME
   * ============================================================
   */

  const fileTeam1 =
    match.team1_short ||
    match.team1_name ||
    'Team1';

  const fileTeam2 =
    match.team2_short ||
    match.team2_name ||
    'Team2';

  const cleanFileName =
    `${fileTeam1}-vs-${fileTeam2}-scorecard`
      .replace(
        /[^a-zA-Z0-9-_]+/g,
        '-'
      )
      .replace(
        /-+/g,
        '-'
      )
      .replace(
        /^-|-$/g,
        ''
      );

  /*
   * ============================================================
   * SAVE
   * ============================================================
   */

  doc.save(
    `${cleanFileName}.pdf`
  );
}
