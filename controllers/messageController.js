const Message = require('../models/Message');
const { createNotification } = require('../utils/notifications');

/**
 * @route POST /api/messages
 * @desc  Client sends a message to support
 */
const sendMessageAsClient = async (req, res, next) => {
  try {
    const { subject, body, parentMessage } = req.body;
    const message = await Message.create({
      user: req.user._id,
      sender: 'client',
      senderId: req.user._id,
      subject,
      body,
      parentMessage: parentMessage || undefined
    });
    res.status(201).json({ success: true, message: 'Message sent to support.', data: { message } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route GET /api/messages
 * @desc  Client views their message thread
 */
const getMyMessages = async (req, res, next) => {
  try {
    const messages = await Message.find({ user: req.user._id }).sort({ createdAt: 1 });
    res.json({ success: true, data: { messages } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/admin/messages/:userId
 * @desc  Admin replies to a client's message thread
 */
const sendMessageAsAdmin = async (req, res, next) => {
  try {
    const { subject, body, parentMessage } = req.body;
    const { userId } = req.params;

    const message = await Message.create({
      user: userId,
      sender: 'admin',
      senderId: req.admin._id,
      subject,
      body,
      parentMessage: parentMessage || undefined
    });

    await createNotification(userId, 'message', {
      title: 'New Message from Support',
      message: `Support has sent you a message: "${subject}"`
    });

    res.status(201).json({ success: true, message: 'Reply sent.', data: { message } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route GET /api/admin/messages/:userId
 * @desc  Admin views a client's message thread
 */
const getClientMessages = async (req, res, next) => {
  try {
    const messages = await Message.find({ user: req.params.userId }).sort({ createdAt: 1 });
    res.json({ success: true, data: { messages } });
  } catch (error) {
    next(error);
  }
};

module.exports = { sendMessageAsClient, getMyMessages, sendMessageAsAdmin, getClientMessages };
