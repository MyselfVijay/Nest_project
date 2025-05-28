import { Injectable, ConflictException, NotFoundException, BadRequestException, InternalServerErrorException, HttpException, HttpStatus } from '@nestjs/common';
import { User, UserDocument } from '../schemas/user.schema';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
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
    try {
      const recordsFilter: any = { hospitalId };
      
      if (filters.patientId) {
        recordsFilter.patientId = filters.patientId;
      }
      if (filters.diagnosis) {
        recordsFilter.diagnosis = { $regex: filters.diagnosis, $options: 'i' };
      }

      // Handle date filtering
      if (filters.fromDate || filters.toDate) {
        recordsFilter.visitDate = {};
        
        // Parse dd/mm/yyyy to Date object
        const parseDate = (dateStr: string) => {
          try {
            const [day, month, year] = dateStr.split('/');
            if (!day || !month || !year) {
              throw new BadRequestException('Invalid date format. Use dd/mm/yyyy');
            }
            const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            if (isNaN(date.getTime())) {
              throw new BadRequestException('Invalid date');
            }
            return date;
          } catch (error) {
            throw new BadRequestException('Invalid date format. Use dd/mm/yyyy');
          }
        };

        // Handle single date query
        if (filters.fromDate && !filters.toDate) {
          const date = parseDate(filters.fromDate);
          const startOfDay = new Date(date.setHours(0, 0, 0, 0));
          const endOfDay = new Date(date.setHours(23, 59, 59, 999));
          recordsFilter.visitDate = {
            $gte: startOfDay,
            $lte: endOfDay
          };
        } 
        // Handle date range query
        else if (filters.fromDate && filters.toDate) {
          const fromDate = parseDate(filters.fromDate);
          const toDate = parseDate(filters.toDate);
          
          if (fromDate > toDate) {
            throw new BadRequestException('From date must be before or equal to to date');
          }
          
          recordsFilter.visitDate = {
            $gte: new Date(fromDate.setHours(0, 0, 0, 0)),
            $lte: new Date(toDate.setHours(23, 59, 59, 999))
          };
        }
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
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error fetching health records:', error);
      throw new InternalServerErrorException('Failed to fetch health records');
    }
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

  async getHospitalPatientsDetails(hospitalId: string, filters: {
    name?: string,
    email?: string,
    fromDate?: string,
    toDate?: string
  }) {
    // Get all patients from the hospital
    const query: any = { hospitalId, userType: 'patient' };
    
    if (filters.name) {
      query.name = { $regex: filters.name, $options: 'i' };
    }
    if (filters.email) {
      query.email = { $regex: filters.email, $options: 'i' };
    }
  
    const patients = await this.userModel.find(query, { password: 0 });
  
    // Get health records for each patient
    const patientDetails = await Promise.all(patients.map(async (patient) => {
      const healthRecords = await this.healthRecordModel.find({
        patientId: patient._id,
        ...(filters.fromDate && { visitDate: { $gte: new Date(filters.fromDate) } }),
        ...(filters.toDate && { visitDate: { $lte: new Date(filters.toDate) } })
      }).populate('doctorId', 'name email');
  
      return {
        patientId: patient._id,
        name: patient.name,
        email: patient.email,
        mobileNo: patient.mobileNo,
        age: patient.age,
        gender: patient.gender,
        healthRecords: healthRecords.map(record => ({
          diagnosis: record.diagnosis,
          prescription: record.prescription,
          notes: record.notes,
          visitDate: record.visitDate,
          doctor: record.doctorId
        }))
      };
    }));
  
    return {
      message: 'Hospital patients details retrieved successfully',
      data: patientDetails
    };
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

    // Validate MongoDB ObjectId format for doctorId only
    if (!doctorId.match(/^[0-9a-fA-F]{24}$/)) {
      throw new BadRequestException('Invalid doctor ID format');
    }

    // Verify doctor exists and belongs to hospital
    const doctor = await this.userModel.findOne({ 
      _id: doctorId, 
      hospitalId, 
      userType: 'doctor' 
    });
    if (!doctor) {
      throw new NotFoundException('Doctor not found or does not belong to this hospital');
    }

    const BATCH_SIZE = 5; // Reduced from 10 to 5
    const SLOT_DURATION = 30;
    const BATCH_DELAY = 300; // ms delay between batches
    
    const startTime = new Date(fromTime);
    const endTime = new Date(toTime);
    
    // Validate time range
    if (startTime >= endTime) {
      throw new BadRequestException('Start time must be before end time');
    }

    // Calculate total minutes between start and end time
    const totalMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / (1000 * 60));
    if (totalMinutes < SLOT_DURATION) {
      throw new BadRequestException(`Time range must be at least ${SLOT_DURATION} minutes`);
    }

    // Calculate number of slots
    const numberOfSlots = Math.floor(totalMinutes / SLOT_DURATION);
    if (numberOfSlots === 0) {
      throw new BadRequestException('No valid slots can be created with the given time range');
    }

    console.log('Debug - Time calculations:', {
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      totalMinutes,
      numberOfSlots
    });

    // Clear existing slots first
    console.log('Debug - Clearing existing slots for:', { doctorId, hospitalId, startTime, endTime });
    const deleteResult = await this.availabilityModel.deleteMany({
      doctorId,
      hospitalId,
      fromTime: { $gte: startTime },
      toTime: { $lte: endTime }
    });
    console.log('Debug - Deleted existing slots:', deleteResult);

    const allSlots: DoctorAvailabilityDocument[] = [];
    let currentTime = new Date(startTime);

    // Create slots
    for (let i = 0; i < numberOfSlots; i++) {
      const slotEndTime = new Date(currentTime.getTime() + SLOT_DURATION * 60000);
      
      // Format time for display using UTC time
      const startHour = currentTime.getUTCHours().toString().padStart(2, '0');
      const startMin = currentTime.getUTCMinutes().toString().padStart(2, '0');
      const endHour = slotEndTime.getUTCHours().toString().padStart(2, '0');
      const endMin = slotEndTime.getUTCMinutes().toString().padStart(2, '0');

      const slot = {
        doctorId,
        hospitalId,
        slotDate: new Date(currentTime), // Use the same date as the slot
        slotTime: `${startHour}:${startMin}-${endHour}:${endMin}`,
        fromTime: new Date(currentTime),
        toTime: new Date(slotEndTime),
        isAvailable: true
      };

      console.log('Debug - Creating slot:', {
        slotNumber: i + 1,
        slotTime: slot.slotTime,
        slotDate: slot.slotDate.toISOString(),
        fromTime: slot.fromTime.toISOString(),
        toTime: slot.toTime.toISOString()
      });

      allSlots.push(slot as DoctorAvailabilityDocument);
      currentTime = new Date(slotEndTime);
    }

    // Insert slots in batches
    for (let i = 0; i < allSlots.length; i += BATCH_SIZE) {
      const batch = allSlots.slice(i, i + BATCH_SIZE);
      console.log(`Debug - Inserting batch ${i / BATCH_SIZE + 1} of ${Math.ceil(allSlots.length / BATCH_SIZE)}`);
      try {
        const insertResult = await this.availabilityModel.insertMany(batch, { ordered: false });
        console.log(`Debug - Successfully inserted batch ${i / BATCH_SIZE + 1}:`, {
          insertedCount: insertResult.length,
          firstSlot: insertResult[0] ? {
            _id: insertResult[0]._id,
            slotTime: insertResult[0].slotTime,
            slotDate: insertResult[0].slotDate
          } : null
        });
      } catch (error) {
        console.error('Debug - Error inserting batch:', {
          error: error.message,
          code: error.code,
          batchSize: batch.length,
          firstSlot: batch[0]
        });
        throw new InternalServerErrorException(`Failed to save slots to database: ${error.message}`);
      }
    }

    // Verify slots were saved
    try {
      const savedSlots = await this.availabilityModel.find({
        doctorId,
        hospitalId,
        fromTime: { $gte: startTime },
        toTime: { $lte: endTime }
      }).sort({ fromTime: 1 }); // Sort by fromTime to get slots in order

      console.log('Debug - Verification - Found saved slots:', {
        count: savedSlots.length,
        firstSlot: savedSlots[0] ? {
          _id: savedSlots[0]._id,
          slotTime: savedSlots[0].slotTime,
          slotDate: savedSlots[0].slotDate
        } : null
      });

      if (savedSlots.length === 0) {
        console.error('Debug - No slots were saved to database');
        throw new InternalServerErrorException('Failed to save slots to database - verification failed');
      }

      return {
        data: savedSlots.map(slot => ({
          _id: slot._id,
          doctorId: slot.doctorId,
          hospitalId: slot.hospitalId,
          slotTime: slot.slotTime,
          isAvailable: slot.isAvailable
        }))
      };
    } catch (error) {
      console.error('Debug - Error verifying saved slots:', {
        error: error.message,
        code: error.code
      });
      throw new InternalServerErrorException(`Failed to verify saved slots: ${error.message}`);
    }
  }

  async getAvailableDoctors(hospitalId: string, date: Date) {
    if (!hospitalId) {
      throw new BadRequestException('Hospital ID is required');
    }
    if (!date || isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date provided');
    }

    // Validate hospital exists
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);
  
    const availabilities = await this.availabilityModel.find({
      hospitalId,
      fromTime: { $gte: startOfDay },
      toTime: { $lte: endOfDay },
      isAvailable: true
    }).populate('doctorId', 'name email')
    .sort({ fromTime: 1 }); // Sort slots by time
  
    // Group slots by doctor
    const doctorSlots = availabilities.reduce((acc, slot) => {
      if (!slot.doctorId) return acc;
  
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
        isAvailable: slot.isAvailable
      });
      return acc;
    }, {});
  
    return {
      data: Object.values(doctorSlots)
    };
  }

  async bookAppointment(doctorId: string, patientId: string, hospitalId: string, slotTime?: string, slotId?: string) {
    try {
      // Input validation
      if (!doctorId || !patientId || !hospitalId || (!slotTime && !slotId)) {
        throw new BadRequestException('Either slotTime or slotId is required');
      }

      // Validate MongoDB ObjectId format
      if (!doctorId.match(/^[0-9a-fA-F]{24}$/) || !patientId.match(/^[0-9a-fA-F]{24}$/)) {
        throw new BadRequestException('Invalid doctor or patient ID format');
      }
      
      if (slotId && !slotId.match(/^[0-9a-fA-F]{24}$/)) {
        throw new BadRequestException('Invalid slot ID format');
      }

      // Get today's date at start of day in UTC
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      let availability;

      if (slotId) {
        // Find slot by ID
        availability = await this.availabilityModel.findOne({
          _id: slotId,
          doctorId,
          hospitalId,
          isAvailable: true
        });

        if (!availability) {
          throw new NotFoundException(`No available slot found with ID: ${slotId}`);
        }
      } else if (slotTime) {
        // Validate slot time format (HH:MM-HH:MM)
        if (!slotTime.match(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]-([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)) {
          throw new BadRequestException('Invalid slot time format. Use format HH:MM-HH:MM (e.g., 09:00-09:30)');
        }

        // Find slot by time
        availability = await this.availabilityModel.findOne({
          doctorId,
          hospitalId,
          slotTime,
          isAvailable: true,
          slotDate: { $gte: today }
        }).sort({ slotDate: 1, fromTime: 1 });

        if (!availability) {
          throw new NotFoundException(`No available slot found for time: ${slotTime}`);
        }
      }

      if (!availability) {
        throw new NotFoundException('No available slot found');
      }

      // Check if slot time is in the future
      if (availability.fromTime <= new Date()) {
        throw new BadRequestException('Cannot book appointments for past time slots');
      }

      // Check for existing appointments
      const existingAppointment = await this.appointmentModel.findOne({
        doctorId,
        appointmentTime: availability.fromTime,
        status: 'scheduled'
      });

      if (existingAppointment) {
        throw new ConflictException('This time slot is already booked');
      }

      // Check patient's existing appointments
      const patientExistingAppointment = await this.appointmentModel.findOne({
        patientId,
        appointmentTime: availability.fromTime,
        status: 'scheduled'
      });

      if (patientExistingAppointment) {
        throw new ConflictException('You already have an appointment scheduled at this time');
      }

      // Create appointment and mark slot as unavailable
      const appointment = new this.appointmentModel({
        doctorId,
        patientId,
        hospitalId,
        appointmentTime: availability.fromTime,
        status: 'scheduled'
      });

      await this.availabilityModel.findByIdAndUpdate(
        availability._id,
        { isAvailable: false }
      );

      // Fetch doctor and patient information
      const doctor = await this.userModel.findById(doctorId);
      const patient = await this.userModel.findById(patientId);

      if (!doctor || doctor.userType !== 'doctor') {
        throw new NotFoundException('Doctor not found');
      }

      if (!patient || patient.userType !== 'patient') {
        throw new NotFoundException('Patient not found');
      }

      const savedAppointment = await appointment.save();

      return {
        message: "Appointment booked successfully",
        data: {
          _id: savedAppointment._id,
          doctor: {
            _id: doctor._id,
            name: doctor.name,
            email: doctor.email
          },
          patient: {
            _id: patient._id,
            name: patient.name,
            email: patient.email
          },
          hospitalId: savedAppointment.hospitalId,
          slotTime: availability.slotTime,
          appointmentTime: savedAppointment.appointmentTime,
          status: savedAppointment.status
        }
      };
    } catch (error) {
      console.error('Error booking appointment:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to book appointment: ' + error.message);
    }
}

  async getBookedAppointments(hospitalId: string, filters: {
      doctorId?: string,
      patientId?: string,
      fromDate?: Date,
      toDate?: Date,
      status?: 'scheduled' | 'completed' | 'cancelled'
  }) {
    if (!hospitalId) {
      throw new BadRequestException('Hospital ID is required');
    }

    const query: any = { hospitalId };
    
    if (filters.doctorId) {
      if (!filters.doctorId.match(/^[0-9a-fA-F]{24}$/)) {
        throw new BadRequestException('Invalid doctor ID format');
      }
      query.doctorId = filters.doctorId;
    }

    if (filters.patientId) {
      if (!filters.patientId.match(/^[0-9a-fA-F]{24}$/)) {
        throw new BadRequestException('Invalid patient ID format');
      }
      query.patientId = filters.patientId;
    }

    if (filters.status) {
      if (!['scheduled', 'completed', 'cancelled'].includes(filters.status)) {
        throw new BadRequestException('Invalid status value');
      }
      query.status = filters.status;
    }

    // Add date filtering
    if (filters.fromDate || filters.toDate) {
      query.appointmentTime = {};
      
      if (filters.fromDate) {
        const startOfDay = new Date(filters.fromDate);
        startOfDay.setUTCHours(0, 0, 0, 0);
        query.appointmentTime.$gte = startOfDay;
      }
      
      if (filters.toDate) {
        const endOfDay = new Date(filters.toDate);
        endOfDay.setUTCHours(23, 59, 59, 999);
        query.appointmentTime.$lte = endOfDay;
      }
    }

    const appointments = await this.appointmentModel
      .find(query)
      .populate('doctorId', 'name email')
      .populate('patientId', 'name email')
      .sort({ appointmentTime: 1 });

    return {
      message: 'Booked Appointments list retrieved successfully',
      data: appointments
    };
  }
}