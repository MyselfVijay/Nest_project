import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('auth/notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('test-email')
  @UseGuards(JwtAuthGuard)
  async testEmail(@Body() body: { email: string }) {
    try {
      await this.notificationService.testAppointmentReminder({
        patientId: { email: body.email },
        doctorId: {
          name: 'Test Doctor',
          email: 'test.doctor@gmail.com',
          specialization: 'Cardiologist'
        },
        appointmentDate: new Date(),
        location: 'HOSP001'
      });
      
      return { message: 'Test email sent successfully' };
    } catch (error) {
      return { message: 'Failed to send test email', error: error.message };
    }
  }
} 