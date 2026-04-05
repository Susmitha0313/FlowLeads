// /**
//  * Generates a .vcf (vCard 3.0) string from a profile object.
//  */
// export function generateVCF(profile) {
//   console.log(`[VCF:generateVCF] Building vCard for "${profile.name}"...`);

//   const lines = [
//     'BEGIN:VCARD',
//     'VERSION:3.0',
//     `FN:${profile.name || ''}`,
//   ];

//   if (profile.designation || profile.company) {
//     lines.push(`TITLE:${profile.designation || ''}`);
//     lines.push(`ORG:${profile.company || ''}`);
//     console.log(`[VCF:generateVCF] Added title/org — "${profile.designation}" @ "${profile.company}"`);
//   }

//   (profile.emails || []).forEach((email) => {
//     lines.push(`EMAIL;TYPE=INTERNET:${email}`);
//     console.log(`[VCF:generateVCF] Added email: ${email}`);
//   });

//   (profile.phones || []).forEach((phone) => {
//     lines.push(`TEL;TYPE=CELL:${phone}`);
//     console.log(`[VCF:generateVCF] Added phone: ${phone}`);
//   });

//   // if (profile.location) {
//   //   lines.push(`ADR;TYPE=WORK:;;${profile.location};;;;`);
//   //   console.log(`[VCF:generateVCF] Added location: ${profile.location}`);
//   // }

//   if (profile.profileUrl) {
//     lines.push(`URL:${profile.profileUrl}`);
//   }

//   (profile.websites || []).forEach((site) => {
//     lines.push(`URL;TYPE=WORK:${site}`);
//     console.log(`[VCF:generateVCF] Added website: ${site}`);
//   });

//   if (profile.headline) {
//     lines.push(`NOTE:${profile.headline}`);
//   }

//   if (profile.profileImageUrl) {
//     lines.push(`PHOTO;VALUE=URI:${profile.profileImageUrl}`);
//   }

//   lines.push('END:VCARD');

//   const vcf = lines.join('\r\n');
//   console.log(`[VCF:generateVCF] ✓ vCard generated — ${lines.length} lines, ${vcf.length} chars`);
//   return vcf;
// }



export function generateVCF(profile) {
  console.log(`[VCF:generateVCF] Building vCard for "${profile.name}"...`);

  const name = (profile.name || '').trim();
  const parts = name.split(/\s+/);
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ');

  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${name}`,
    `N:${lastName};${firstName};;;`,
  ];

  if (profile.designation) lines.push(`TITLE:${profile.designation}`);
  if (profile.company)     lines.push(`ORG:${profile.company}`);

  (profile.emails || []).forEach(email => {
    lines.push(`EMAIL;TYPE=INTERNET:${email}`);
  });

  (profile.phones || []).forEach(phone => {
    // normalise: strip non-digits then re-add + prefix
    const digits = phone.replace(/\D/g, '');
    lines.push(`TEL;TYPE=CELL:+${digits}`);
  });

  if (profile.profileUrl) lines.push(`URL:${profile.profileUrl}`);

  lines.push('END:VCARD');

  // vCard spec requires CRLF line endings AND a trailing CRLF
  const vcf = lines.join('\r\n') + '\r\n';

  console.log(`[VCF:generateVCF] ✓ vCard generated`);
  console.log(vcf);

  return vcf;
}