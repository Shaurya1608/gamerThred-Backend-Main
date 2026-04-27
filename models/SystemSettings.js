import mongoose from "mongoose";

const systemSettingsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  description: {
    type: String
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, { timestamps: true });

// 🛠️ Pre-seed default settings helper
systemSettingsSchema.statics.getOrInit = async function (key, defaultValue) {
    let setting = await this.findOne({ key });
    if (!setting) {
        setting = await this.create({ key, value: defaultValue });
    }
    return setting;
};

const SystemSettings = mongoose.model("SystemSettings", systemSettingsSchema);
export default SystemSettings;
