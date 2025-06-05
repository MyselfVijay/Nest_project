import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MailerService } from '@nestjs-modules/mailer';
import { Appointment } from '../schemas/appointment.schema';
import { User } from '../schemas/user.schema';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectModel(Appointment.name) private appointmentModel: Model<Appointment>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly mailerService: MailerService,
  ) {}

  // Public method for testing email reminders
  async testAppointmentReminder(testData: any) {
    return this.sendAppointmentReminder(testData, 'immediate');
  }

  // Run every minute to check for immediate notifications
  @Cron(CronExpression.EVERY_MINUTE)
  async handleImmediateReminders() {
    this.logger.debug('Checking for immediate appointment reminders...');
    
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60000);

    const upcomingAppointments = await this.appointmentModel.find({
      appointmentDate: {
        $gte: now,
        $lte: fiveMinutesFromNow
      },
      status: 'confirmed',
      reminderSent: { $ne: true }
    }).populate('patientId doctorId');

    for (const appointment of upcomingAppointments) {
      await this.sendAppointmentReminder(appointment, 'immediate');
      
      // Mark reminder as sent
      await this.appointmentModel.findByIdAndUpdate(appointment._id, {
        reminderSent: true
      });
    }
  }

  // Run every hour to send reminders for appointments in 24 hours
  @Cron(CronExpression.EVERY_HOUR)
  async handleDayBeforeReminders() {
    this.logger.debug('Checking for 24-hour appointment reminders...');
    
    const now = new Date();
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60000);
    const twentyThreeHoursFromNow = new Date(now.getTime() + 23 * 60 * 60000);

    const upcomingAppointments = await this.appointmentModel.find({
      appointmentDate: {
        $gte: twentyThreeHoursFromNow,
        $lte: twentyFourHoursFromNow
      },
      status: 'confirmed',
      dayBeforeReminderSent: { $ne: true }
    }).populate('patientId doctorId');

    for (const appointment of upcomingAppointments) {
      await this.sendAppointmentReminder(appointment, '24hour');
      
      // Mark 24-hour reminder as sent
      await this.appointmentModel.findByIdAndUpdate(appointment._id, {
        dayBeforeReminderSent: true
      });
    }
  }

  // Run at 8 AM every day to send reminders for appointments in the next week
  @Cron('0 8 * * *')
  async handleWeeklyReminders() {
    this.logger.debug('Checking for weekly appointment reminders...');
    
    const now = new Date();
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60000);
    const sixDaysFromNow = new Date(now.getTime() + 6 * 24 * 60 * 60000);

    const upcomingAppointments = await this.appointmentModel.find({
      appointmentDate: {
        $gte: sixDaysFromNow,
        $lte: oneWeekFromNow
      },
      status: 'confirmed',
      weeklyReminderSent: { $ne: true }
    }).populate('patientId doctorId');

    for (const appointment of upcomingAppointments) {
      await this.sendAppointmentReminder(appointment, 'weekly');
      
      // Mark weekly reminder as sent
      await this.appointmentModel.findByIdAndUpdate(appointment._id, {
        weeklyReminderSent: true
      });
    }
  }

  private async sendAppointmentReminder(appointment: any, type: 'immediate' | '24hour' | 'weekly') {
    const patient = appointment.patientId;
    const doctor = appointment.doctorId;
    
    if (!patient || !patient.email || !doctor) {
      this.logger.error(`Missing patient or doctor information for appointment ${appointment._id}`);
      return;
    }

    const appointmentDate = new Date(appointment.appointmentDate);
    const formattedDate = appointmentDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const formattedTime = appointmentDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });

    let subject: string;
    let urgencyMessage: string;

    switch (type) {
      case 'immediate':
        subject = '🚨 Urgent: Your Appointment is in 5 Minutes!';
        urgencyMessage = 'Your appointment is starting in 5 minutes!';
        break;
      case '24hour':
        subject = '⏰ Reminder: Your Appointment is Tomorrow';
        urgencyMessage = 'Your appointment is scheduled for tomorrow.';
        break;
      case 'weekly':
        subject = '📅 Upcoming Appointment Next Week';
        urgencyMessage = 'Your appointment is scheduled for next week.';
        break;
    }

    try {
      await this.mailerService.sendMail({
        to: patient.email,
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2c3e50;">Appointment Reminder</h2>
            <p style="color: #e74c3c; font-weight: bold;">${urgencyMessage}</p>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Date:</strong> ${formattedDate}</p>
              <p><strong>Time:</strong> ${formattedTime}</p>
              <p><strong>Doctor:</strong> Dr. ${doctor.name}</p>
              <p><strong>Location:</strong> ${appointment.location || 'Main Hospital Building'}</p>
            </div>
            <div style="margin-top: 20px;">
              <p><strong>Important Notes:</strong></p>
              <ul>
                <li>Please arrive 10 minutes before your appointment time</li>
                <li>Bring any relevant medical records or test results</li>
                <li>If you need to reschedule, please contact us at least 24 hours in advance</li>
              </ul>
            </div>
            <p style="color: #7f8c8d; font-size: 0.9em; margin-top: 20px;">
              If you have any questions, please contact our support team.
            </p>
          </div>
        `
      });

      this.logger.log(`Successfully sent ${type} reminder for appointment ${appointment._id} to ${patient.email}`);
    } catch (error) {
      this.logger.error(`Failed to send ${type} reminder for appointment ${appointment._id}:`, error);
    }
  }
} 