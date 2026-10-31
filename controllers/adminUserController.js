import Order from '../models/Order.js';
import User from '../models/User.js';

export async function getAdminUsers(_req, res, next) {
  try {
    const [users, orderCounts] = await Promise.all([
      User.find().select('name phoneNumber email createdAt').sort({ createdAt: -1 }).lean(),
      Order.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: {
          _id: '$userId',
          totalOrders: { $sum: 1 },
          totalPurchasingPaise: { $sum: '$amount' }
        } }
      ])
    ]);

    const countsByUserId = new Map(orderCounts.map((summary) => [String(summary._id), summary]));
    const serializedUsers = users.map((user) => ({
      id: String(user._id),
      name: user.name,
      phoneNumber: user.phoneNumber || '',
      email: user.email,
      totalOrders: countsByUserId.get(String(user._id))?.totalOrders || 0,
      totalPurchasing: (countsByUserId.get(String(user._id))?.totalPurchasingPaise || 0) / 100,
      createdAt: user.createdAt
    }));

    const topUsers = [...serializedUsers]
      .filter((user) => user.totalOrders > 0)
      .sort((first, second) => second.totalOrders - first.totalOrders || first.name.localeCompare(second.name))
      .slice(0, 3);

    return res.json({ totalUsers: serializedUsers.length, topUsers, users: serializedUsers });
  } catch (error) {
    return next(error);
  }
}
