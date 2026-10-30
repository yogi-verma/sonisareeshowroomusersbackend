import User from '../models/User.js';

const addressFields = [
  'label',
  'flatHouseNo',
  'areaStreetSectorVillage',
  'landmark',
  'pincode',
  'townCity',
  'state',
  'isDefault'
];

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function assertObjectBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'A JSON object is required.');
  }
}

function pickAddressFields(body, { partial = false } = {}) {
  assertObjectBody(body);
  const unknownFields = Object.keys(body).filter((field) => !addressFields.includes(field));
  if (unknownFields.length) throw httpError(400, `Unsupported address field: ${unknownFields[0]}.`);

  if (!partial) {
    const requiredFields = ['areaStreetSectorVillage', 'pincode', 'townCity', 'state'];
    const missing = requiredFields.find((field) => typeof body[field] !== 'string' || !body[field].trim());
    if (missing) throw httpError(400, `${missing} is required.`);
  }

  const result = {};
  for (const field of addressFields) {
    if (!(field in body)) continue;
    const value = body[field];

    if (field === 'isDefault') {
      if (field === 'isDefault' && typeof value !== 'boolean') {
        throw httpError(400, 'isDefault must be true or false.');
      }
      result[field] = value;
      continue;
    }

    if (typeof value !== 'string') throw httpError(400, `${field} must be a string.`);
    result[field] = value.trim();
  }

  if ('pincode' in result && !/^\d{6}$/.test(result.pincode)) {
    throw httpError(400, 'Pincode must contain 6 digits.');
  }
  return result;
}

export function getProfile(req, res) {
  const { _id, name, email, picture, phoneNumber, addresses, createdAt, updatedAt } = req.user;
  return res.json({
    user: { id: _id, name, email, picture, phoneNumber, addresses, createdAt, updatedAt }
  });
}

export async function updateProfile(req, res, next) {
  try {
    assertObjectBody(req.body);
    const fields = Object.keys(req.body);
    if (fields.length !== 1 || fields[0] !== 'phoneNumber') {
      throw httpError(400, 'Only phoneNumber can be updated through this endpoint.');
    }

    const { phoneNumber } = req.body;
    if (typeof phoneNumber !== 'string') throw httpError(400, 'phoneNumber must be a string.');
    const normalizedPhone = phoneNumber.trim();
    if (normalizedPhone && (!/^\+?[0-9().\s-]{7,20}$/.test(normalizedPhone) ||
        normalizedPhone.replace(/\D/g, '').length < 7 || normalizedPhone.replace(/\D/g, '').length > 15)) {
      throw httpError(400, 'Enter a valid phone number.');
    }

    req.user.phoneNumber = normalizedPhone;
    await req.user.save();
    return res.json({ phoneNumber: req.user.phoneNumber });
  } catch (error) {
    return next(error);
  }
}

export function listAddresses(req, res) {
  return res.json({ addresses: req.user.addresses });
}

export async function createAddress(req, res, next) {
  try {
    const addressData = pickAddressFields(req.body);
    const hasDefaultAddress = req.user.addresses.some((address) => address.isDefault);
    const makeDefault = addressData.isDefault === true || !hasDefaultAddress;
    if (makeDefault) req.user.addresses.forEach((address) => { address.isDefault = false; });

    const address = req.user.addresses.create({ ...addressData, isDefault: makeDefault });
    req.user.addresses.push(address);
    await req.user.save();
    return res.status(201).json({ address });
  } catch (error) {
    return next(error);
  }
}

export async function updateAddress(req, res, next) {
  try {
    const address = req.user.addresses.id(req.params.addressId);
    if (!address) throw httpError(404, 'Address not found.');
    const updates = pickAddressFields(req.body, { partial: true });
    if (!Object.keys(updates).length) throw httpError(400, 'Provide at least one address field to update.');

    const selectingDefault = updates.isDefault === true;
    const unsettingDefault = updates.isDefault === false && address.isDefault;
    if (selectingDefault) req.user.addresses.forEach((entry) => { entry.isDefault = false; });
    address.set(updates);

    if (selectingDefault) {
      address.isDefault = true;
    } else if (unsettingDefault) {
      const replacement = req.user.addresses.find((entry) => entry.id !== address.id);
      if (replacement) replacement.isDefault = true;
      else address.isDefault = true;
    }

    await req.user.save();
    return res.json({ address });
  } catch (error) {
    return next(error);
  }
}

export async function deleteAddress(req, res, next) {
  try {
    const address = req.user.addresses.id(req.params.addressId);
    if (!address) throw httpError(404, 'Address not found.');
    const wasDefault = address.isDefault;
    req.user.addresses.pull(address._id);
    if (wasDefault && req.user.addresses.length) req.user.addresses[0].isDefault = true;
    await req.user.save();
    return res.json({ message: 'Address deleted successfully.' });
  } catch (error) {
    return next(error);
  }
}

