import mongoose from "mongoose";

const profileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    headline: { type: String, default: '' },
    designation: { type: String, default: '' },
    company: { type: String, default: '' },
    location: { type: String, default: '' },
    emails: [{ type: String }],
    phones: [{ type: String }],
    websites: [{ type: String }],
    profileUrl: { type: String, required: true, unique: true },
    profileImageUrl: { type: String, default: '' },
    scrapedAt: { type: Date, default: Date.now },
    savedToContacts: { type: Boolean, default: false },
    notes: { type: String, default: '' },
    tags: [{ type: String }],
  },
  { timestamps: true }
);

// Text index for full-text search
profileSchema.index({ name: 'text', company: 'text', designation: 'text' });

export default mongoose.model("Profile", profileSchema);
