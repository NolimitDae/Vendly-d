"use client";

import TrashIcon from "@/icons/TrashIcon";
import Image from "next/image";
import React from "react";
import { FileInput, GenericInput } from "../../Input";
import GenericButton from "../GenericButton";

const ProfileContent = () => {
  return (
    <div className="flex flex-col mt-6 lg:mt-8">
      {/* Top Section */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Section */}
        <div className="space-y-1 lg:max-w-[260px]">
          <h2 className="text-blackColor text-base font-medium leading-[160%]">
            Personal Information
          </h2>
          <p className="text-descriptionColor text-sm leading-[160%]">
            Manage your basic details for identification and communication.
          </p>
        </div>

        {/* Right Section */}
        <div className="flex-1 min-w-0">
          <h2 className="text-sm text-blackColor font-medium leading-[160%]">
            Profile picture
          </h2>

          {/* Image + Upload */}
          <div className="flex flex-col sm:flex-row gap-4 mt-2">
            {/* Image */}
            <div className=" relative shrink-0 mx-auto sm:mx-0 w-20 h-20">
              <Image
                src={"/profile.png"}
                alt="profile"
                width={100}
                height={100}
                className="w-20 h-20  rounded-full object-cover"
              />

              <button
                type="button"
                className="bg-[#EB3D4D] w-8 h-8 rounded-full flex items-center 
                justify-center border-[1.5px] border-white absolute bottom-0 right-0 translate-x-1/4 translate-y-1/4"
              >
                <TrashIcon />
              </button>
            </div>

            {/* Drag & Drop */}
            <div className="flex-1 min-w-0">
              <FileInput
                dragAndDrop
                fullWidth
                inputClassName="w-full bg-grayBg border border-dashed border-borderColor rounded-xl"
                wrapperClassName="w-full"
              />
            </div>
          </div>

          {/* Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 mt-4 gap-4">
            <GenericInput
              label="First Name"
              placeholder="Enter your first name"
              fullWidth
            />
            <GenericInput
              label="Last Name"
              placeholder="Enter your last name"
              fullWidth
            />
            <GenericInput
              label="Email Address"
              placeholder="Enter your email address"
              fullWidth
            />
            <GenericInput
              label="Phone Number"
              placeholder="Enter your phone number"
              fullWidth
            />
          </div>
        </div>
      </div>

      {/* Divider */}
      <hr className="hidden md:block border-borderColor mt-6" />

      {/* Button */}
      <div className="flex flex-col sm:flex-row sm:justify-end gap-3 my-4 sm:mt-15">
        <GenericButton variant="primary" className="w-full sm:w-auto">
          Save Changes
        </GenericButton>
      </div>
    </div>
  );
};

export default ProfileContent;
