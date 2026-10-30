import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema({
  label: { type: String, trim: true, default: 'Home', maxlength: 40 },
  flatHouseNo: { type: String, trim: true, default: '', maxlength: 120 },
  areaStreetSectorVillage: { type: String, trim: true, required: true, maxlength: 180 },
  landmark: { type: String, trim: true, default: '', maxlength: 160 },
  pincode: { type: String, trim: true, required: true, match: /^\d{6}$/ },
  townCity: { type: String, trim: true, required: true, maxlength: 100 },
  state: { type: String, trim: true, required: true, maxlength: 100 },
  isDefault: { type: Boolean, default: false }
}, { timestamps: true });

const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  name: { type: String, required: true, trim: true },
  picture: { type: String, default: '' },
  phoneNumber: {
    type: String,
    trim: true,
    default: '',
    validate: {
      validator: (value) => !value || /^\+?[0-9().\s-]{7,20}$/.test(value) && value.replace(/\D/g, '').length >= 7 && value.replace(/\D/g, '').length <= 15,
      message: 'Enter a valid phone number.'
    }
  },
  addresses: {
    type: [addressSchema],
    default: [],
    validate: { validator: (addresses) => addresses.length <= 20, message: 'You can save up to 20 addresses.' }
  }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
export default User;
