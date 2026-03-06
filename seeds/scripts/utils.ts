import { readFile } from 'fs/promises';

export interface CSVRow {
  [key: string]: string;
}

export async function readCSV(
  filePath: string,
  separator: string = ','
): Promise<CSVRow[]> {
  console.log('Reading CSV file: %s', filePath);
  try {
    const data = await readFile(filePath, 'utf8');

    // Handle different line endings
    const normalizedData = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const lines: string[][] = [];
    let currentLine: string[] = [];
    let currentField = '';
    let insideQuotes = false;

    // Process character by character
    for (let i = 0; i < normalizedData.length; i++) {
      const char = normalizedData[i];

      if (char === '"') {
        if (insideQuotes && normalizedData[i + 1] === '"') {
          // Handle escaped quotes
          currentField += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          insideQuotes = !insideQuotes;
        }
      } else if (char === separator && !insideQuotes) {
        // End of field
        currentLine.push(currentField.trim());
        currentField = '';
      } else if (char === '\n' && !insideQuotes) {
        // End of line
        currentLine.push(currentField.trim());
        if (currentLine.some((field) => field !== '')) {
          lines.push(currentLine);
        }
        currentLine = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }

    // Handle last field and line
    if (currentField) {
      currentLine.push(currentField.trim());
    }
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    // Process headers and rows
    const headers = lines[0];
    const rows = lines.slice(1).map((values) => {
      const row: CSVRow = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      return row;
    });

    console.log('CSV file parsed successfully with %d rows', rows.length);
    return rows;
  } catch (error) {
    console.error(
      'Error reading/parsing CSV file: %s',
      (error as Error).message
    );
    throw new Error(
      `Error reading/parsing CSV file: ${(error as Error).message}`
    );
  }
}
