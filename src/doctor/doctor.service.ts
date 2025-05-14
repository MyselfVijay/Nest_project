import { Injectable, ConflictException, NotFoundException, BadRequestException, InternalServerErrorException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { HealthRecord, HealthRecordDocument } from '../schemas/health-record.schema';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import * as bcrypt from 'bcryptjs';
import { DoctorAvailability, DoctorAvailabilityDocument } from '../schemas/doctor-availability.schema';
import { Appointment, AppointmentDocument } from '../schemas/appointment.schema';

@Injectable()
export class DoctorService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(HealthRecord.name) private healthRecordModel: Model<HealthRecordDocument>,
    @InjectModel(DoctorAvailability.name) private availabilityModel: Model<DoctorAvailabilityDocument>,
    @InjectModel(Appointment.name) private appointmentModel: Model<AppointmentDocument>
  ) {}

  async create(createDoctorDto: CreateDoctorDto, hospitalId: string) {
    try {
      // Validate hospital ID
      if (!hospitalId) {
        throw new BadRequestException('Hospital ID is required');
      }

      // Check if email already exists
      const existingUser = await this.userModel.findOne({ email: createDoctorDto.email });
      if (existingUser) {
        throw new ConflictException('Email already exists');
      }

      const hashedPassword = await bcrypt.hash(createDoctorDto.password, 10);
      const doctor = new this.userModel({
        name: createDoctorDto.name,
        email: createDoctorDto.email.toLowerCase(),
        password: hashedPassword,
        userType: 'doctor',
        hospitalId,
      });

      await doctor.save();
      return {
        message: 'Doctor signup successful',
        data: {
          id: doctor._id,
          name: doctor.name,
          email: doctor.email,
          mobileNo: doctor.mobileNo
        }
      };
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error creating doctor:', error);
      throw new InternalServerErrorException('Failed to create doctor account');
    }
  }

  async update(id: string, updateDoctorDto: UpdateDoctorDto, hospitalId: string) {
    try {
      // Validate inputs
      if (!id || !hospitalId) {
        throw new BadRequestException('Doctor ID and Hospital ID are required');
      }

      // Validate MongoDB ObjectId
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new BadRequestException('Invalid doctor ID format');
      }

      if (updateDoctorDto.email) {
        const existingUser = await this.userModel.findOne({ 
          email: updateDoctorDto.email.toLowerCase(),
          _id: { $ne: id }
        });
        if (existingUser) {
          throw new ConflictException('Email already exists');
        }
        updateDoctorDto.email = updateDoctorDto.email.toLowerCase();
      }

      if (updateDoctorDto.password) {
        updateDoctorDto.password = await bcrypt.hash(updateDoctorDto.password, 10);
      }

      const doctor = await this.userModel.findOneAndUpdate(
        { _id: id, userType: 'doctor', hospitalId },
        updateDoctorDto,
        { new: true }
      );

      if (!doctor) {
        throw new NotFoundException('Doctor not found');
      }

      return {
        message: 'Doctor updated successfully',
        data: {
          name: doctor.name,
          email: doctor.email
        }
      };
    } catch (error) {
      if (error instanceof ConflictException || 
          error instanceof BadRequestException || 
          error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error updating doctor:', error);
      throw new InternalServerErrorException('Failed to update doctor account');
    }
  }

  async remove(id: string, hospitalId: string) {
    try {
      // Validate inputs
      if (!id || !hospitalId) {
        throw new BadRequestException('Doctor ID and Hospital ID are required');
      }

      // Validate MongoDB ObjectId
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new BadRequestException('Invalid doctor ID format');
      }

      const doctor = await this.userModel.findOneAndDelete({
        _id: id,
        userType: 'doctor',
        hospitalId
      });

      if (!doctor) {
        throw new NotFoundException('Doctor not found');
      }

      return { message: 'Doctor deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error deleting doctor:', error);
      throw new InternalServerErrorException('Failed to delete doctor account');
    }
  }

  async getHospitalHealthRecords(hospitalId: string, filters: {
    patientName?: string,
    patientId?: string,
    diagnosis?: string,
    fromDate?: string,
    toDate?: string
  }) {
    const recordsFilter: any = { hospitalId };
    
    if (filters.patientId) {
      recordsFilter.patientId = filters.patientId;
    }
    if (filters.diagnosis) {
      recordsFilter.diagnosis = { $regex: filters.diagnosis, $options: 'i' };
    }
    if (filters.fromDate || filters.toDate) {
      recordsFilter.visitDate = {};
      if (filters.fromDate) recordsFilter.visitDate.$gte = new Date(filters.fromDate);
      if (filters.toDate) recordsFilter.visitDate.$lte = new Date(filters.toDate);
    }

    let records = await this.healthRecordModel.find(recordsFilter)
      .populate('patientId', 'name email mobileNo')
      .populate('doctorId', 'name email')
      .sort({ visitDate: -1 });

    if (filters.patientName) {
      records = records.filter(record => 
        (record.patientId as any).name?.toLowerCase().includes(filters.patientName!.toLowerCase())
      );
    }

    return records;
  }

  async getPatientHealthRecords(patientId: string, hospitalId: string) {
    const patient = await this.userModel.findOne({
      _id: patientId,
      hospitalId,
      userType: 'patient'
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return this.healthRecordModel.find({ patientId })
      .populate('doctorId', 'name')
      .sort({ visitDate: -1 });
  }

  async getHospitalPatients(hospitalId: string, filters: {
    name?: string,
    email?: string,
    patientId?: string
  }) {
    const filter: any = { hospitalId, userType: 'patient' };
    
    if (filters.name) {
      filter.name = { $regex: filters.name, $options: 'i' };
    }
    if (filters.email) {
      filter.email = { $regex: filters.email, $options: 'i' };
    }
    if (filters.patientId) {
      filter._id = filters.patientId;
    }

    return this.userModel.find(
      filter,
      { password: 0 }
    ).select('name email mobileNo createdAt');
  }

  async getAvailabilitySlot(slotId: string) {
    return this.availabilityModel.findById(slotId).exec();
  }

  async setDoctorAvailability(doctorId: string, hospitalId: string, fromTime: Date, toTime: Date) {
    // Input validation
    if (!doctorId || !hospitalId) {
      throw new BadRequestException('Doctor ID and Hospital ID are required');
    }
    if (!fromTime || !toTime || isNaN(fromTime.getTime()) || isNaN(toTime.getTime())) {
      throw new BadRequestException('Invalid date format for fromTime or toTime');
    }
    if (fromTime >= toTime) {
      throw new BadRequestException('fromTime must be before toTime');
    }

    // Validate time difference is at least 30 minutes
    const timeDifferenceMinutes = (toTime.getTime() - fromTime.getTime()) / (1000 * 60);
    if (timeDifferenceMinutes < 30) {
      throw new BadRequestException('Time range must be at least 30 minutes');
    }

    // Validate MongoDB ObjectId format
    if (!doctorId.match(/^[0-9a-fA-F]{24}$/)) {
      throw new BadRequestException('Invalid doctor ID format');
    }

    const BATCH_SIZE = 10;
    const SLOT_DURATION = 30;
    const startTime = new Date(fromTime);
    const endTime = new Date(toTime);
    
    console.log('Creating slots from', startTime, 'to', endTime);
    
    // Clear existing slots first
    await this.availabilityModel.deleteMany({
        doctorId,
        hospitalId,
        fromTime: { $gte: startTime },
        toTime: { $lte: endTime }
    });
    
    const allSlots: DoctorAvailabilityDocument[] = [];
    const currentTime = new Date(startTime.getTime());
    
    while (currentTime < endTime) {
        const batchSlots: Array<Partial<DoctorAvailability>> = [];
        
        for (let i = 0; i < BATCH_SIZE && currentTime < endTime; i++) {
            const slotEndTime = new Date(currentTime.getTime() + SLOT_DURATION * 60000);
            
            if (slotEndTime <= endTime) {
                const startHour = currentTime.getHours().toString().padStart(2, '0');
                const startMin = currentTime.getMinutes().toString().padStart(2, '0');
                const endHour = slotEndTime.getHours().toString().padStart(2, '0');
                const endMin = slotEndTime.getMinutes().toString().padStart(2, '0');
                
                const slot = {
                    doctorId,
                    hospitalId,
                    slotTime: `${startHour}:${startMin}-${endHour}:${endMin}`,
                    fromTime: new Date(currentTime),
                    toTime: new Date(slotEndTime),
                    isAvailable: true
                };
                console.log('Creating slot:', slot.slotTime);
                batchSlots.push(slot);
            }
            
            currentTime.setTime(currentTime.getTime() + SLOT_DURATION * 60000);
        }
        
        if (batchSlots.length > 0) {
            console.log(`Inserting batch of ${batchSlots.length} slots`);
            const insertedSlots = await this.availabilityModel.insertMany(batchSlots, { ordered: false });
            allSlots.push(...insertedSlots);
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (allSlots.length === 0) {
        console.log('No slots were created. Start time:', fromTime, 'End time:', toTime);
        throw new BadRequestException('No valid time slots could be created');
    }

    console.log(`Successfully created ${allSlots.length} slots`);
    return {
        message: 'Availability set successfully',
        data: allSlots.map(slot => ({
            _id: slot._id,
            doctorId: slot.doctorId,
            hospitalId: slot.hospitalId,
            slotTime: slot.slotTime,
            fromTime: slot.fromTime,
            toTime: slot.toTime,
            isAvailable: slot.isAvailable
        }))
    };
}

  async getAvailableDoctors(hospitalId: string, date: Date) {
    if (!date || isNaN(date.getTime())) {
        throw new HttpException('Invalid date provided', HttpStatus.BAD_REQUEST);
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
  
    const availabilities = await this.availabilityModel.find({
      hospitalId,
      fromTime: { $gte: startOfDay },
      toTime: { $lte: endOfDay },
      isAvailable: true
    }).populate('doctorId', 'name email');
  
    // Group slots by doctor
    const doctorSlots = availabilities.reduce((acc, slot) => {
      if (!slot.doctorId) return acc; // Skip if doctorId is null
  
      const doctorId = (slot.doctorId as any)._id.toString();
      if (!acc[doctorId]) {
        acc[doctorId] = {
          doctor: {
            _id: doctorId,
            name: (slot.doctorId as any).name,
            email: (slot.doctorId as any).email
          },
          hospitalId: slot.hospitalId,
          slots: []
        };
      }
      acc[doctorId].slots.push({
        id: slot._id,
        slotTime: slot.slotTime,
        fromTime: slot.fromTime,
        toTime: slot.toTime,
        isAvailable: slot.isAvailable
      });
      return acc;
    }, {});
  
    return Object.values(doctorSlots);
  }

  async bookAppointment(doctorId: string, patientId: string, hospitalId: string, appointmentTime: Date) {
      // Check if doctor is available
      const availability = await this.availabilityModel.findOne({
        doctorId,
        hospitalId,
        fromTime: { $lte: appointmentTime },
        toTime: { $gte: appointmentTime },
        isAvailable: true
      });
  
      if (!availability) {
        throw new HttpException('Doctor is not available at this time', HttpStatus.BAD_REQUEST);
      }
  
      // Check for existing appointments
      const existingAppointment = await this.appointmentModel.findOne({
        doctorId,
        appointmentTime,
        status: 'scheduled'
      });
  
      if (existingAppointment) {
        throw new HttpException('This time slot is already booked', HttpStatus.CONFLICT);
      }
  
      // Create new appointment
      const appointment = new this.appointmentModel({
        doctorId,
        patientId,
        hospitalId,
        appointmentTime,
        status: 'scheduled'
      });
  
      // Mark the slot as unavailable
      await this.availabilityModel.findByIdAndUpdate(
        availability._id,
        { isAvailable: false }
      );
  
      return await appointment.save();
  }

  async getBookedAppointments(hospitalId: string, filters: {
      doctorId?: string,
      patientId?: string,
      fromDate?: Date,
      toDate?: Date,
      status?: 'scheduled' | 'completed' | 'cancelled'
  }) {
      const query: any = { hospitalId };
      
      if (filters.doctorId) {
          query.doctorId = filters.doctorId;
      }
      if (filters.patientId) {
          query.patientId = filters.patientId;
      }
      if (filters.status) {
          query.status = filters.status;
      }
      if (filters.fromDate || filters.toDate) {
          query.appointmentTime = {};
          if (filters.fromDate) {
              query.appointmentTime.$gte = filters.fromDate;
          }
          if (filters.toDate) {
              query.appointmentTime.$lte = filters.toDate;
          }
      }
  
      return this.appointmentModel.find(query)
          .populate('doctorId', 'name email')
          .populate('patientId', 'name email')
          .sort({ appointmentTime: 1 })
          .lean();
  }
}