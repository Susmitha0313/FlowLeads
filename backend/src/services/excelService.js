import ExcelJS from 'exceljs';

export async function exportToExcel(profiles) {
  console.log(`[EXCEL:exportToExcel] Building workbook for ${profiles.length} profile(s)...`);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Bobi';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('LinkedIn Contacts');

  ws.columns = [
    { header: 'Name',         key: 'name',        width: 25 },
    { header: 'Designation',  key: 'designation',  width: 30 },
    { header: 'Company',      key: 'company',      width: 25 },
    { header: 'Email',        key: 'email',        width: 30 },
    { header: 'Phone',        key: 'phone',        width: 20 },
    { header: 'Location',     key: 'location',     width: 25 },
    { header: 'Headline',     key: 'headline',     width: 40 },
    { header: 'LinkedIn URL', key: 'profileUrl',   width: 40 },
    { header: 'Websites',     key: 'websites',     width: 30 },
    { header: 'Scraped At',   key: 'scrapedAt',    width: 18 },
  ];

  ws.getRow(1).font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  ws.getRow(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A66C2' } };
  ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height    = 28;

  profiles.forEach((p, i) => {
    ws.addRow({
      name:       p.name || '',
      designation: p.designation || '',
      company:    p.company || '',
      email:      (p.emails   || []).join(', '),
      phone:      (p.phones   || []).join(', '),
      location:   p.location  || '',
      headline:   p.headline  || '',
      profileUrl: p.profileUrl || '',
      websites:   (p.websites || []).join(', '),
      scrapedAt:  p.scrapedAt ? new Date(p.scrapedAt).toLocaleDateString() : '',
    });
    console.log(`[EXCEL:exportToExcel] Row ${i + 2} added — "${p.name || 'unnamed'}"`);
  });

  ws.autoFilter = { from: 'A1', to: `J${profiles.length + 1}` };

  console.log('[EXCEL:exportToExcel] Writing buffer...');
  const buffer = await workbook.xlsx.writeBuffer();
  console.log(`[EXCEL:exportToExcel] ✓ Buffer ready — ${buffer.byteLength} bytes`);
  return buffer;
}
