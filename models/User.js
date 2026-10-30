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

const cartItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true, trim: true },
  productType: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  unitPrice: { type: Number, required: true, min: 0 },
  photoUrl: { type: String, default: '' },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    max: 99,
    validate: { validator: Number.isInteger, message: 'Cart quantity must be a whole number.' }
  }
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
  },
  cart: {
    type: [cartItemSchema],
    default: [],
    validate: { validator: (items) => items.length <= 100, message: 'Your cart can contain up to 100 different products.' }
  }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
export default User;
