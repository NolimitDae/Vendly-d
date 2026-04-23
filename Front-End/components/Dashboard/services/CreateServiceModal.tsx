import React from "react";
import GenericButton from "../auth/GenericButton";
import { GenericInput, RadioGroup } from "../Input";
import ModalWrapper from "../common/modal/ModalWrapper";
import { ModalHeader } from "../common/modal/ModalHeader";
import ModalBody from "../common/modal/ModalBody";
import { TagInput } from "../Input/tag-input/TagInput";

const headerConfig = {
  padding: "md",
  align: "between",
  showDivider: true,
  wrapperClassName: "bg-white",
  titleClassName: "text-lg font-semibold text-blackColor",
  subtitleClassName: "text-sm text-descriptionColor leading mt-1",
  dividerClassName: "border-borderColor",
} as const;

const bodyConfig = {
  padding: "md",
  background: "default",
  scroll: "auto",
  maxHeight: "75vh",
  className: "space-y-6",
} as const;

const CreateServiceModal = ({ closeModal }: { closeModal: () => void }) => {
  return (
    <ModalWrapper isOpen={true} onClose={closeModal} size="xl">
      <ModalHeader
        title="Create New Event"
        subtitle="Add a new service category to the platform. Fill in all the necessary
          details below"
        {...headerConfig}
      />

      <ModalBody {...bodyConfig}>
        <div className="grid grid-cols-1 gap-4 ">
          <GenericInput
            label="Service Name"
            placeholder="Enter service name"
            labelClassName="mb-2 text-blackColor text-sm font-medium leading-[160%]"
            inputClassName="bg-grayBg"
            variant="outlined"
            size="full"
            fullWidth
          />
          <TagInput
            label="Category"
            defaultValue={["Portrait", "Bridal makeup"]}
            onChange={(val: any) => console.log(val)}
            options={["Portrait", "Bridal makeup", "Wedding", "Fashion"]}
            size="sm"
            variant="outlined"
          />

          <TagInput
            label="Sub Category"
            defaultValue={["Portrait", "Bridal makeup"]}
            onChange={(val: any) => console.log(val)}
            options={["Portrait", "Bridal makeup", "Wedding", "Fashion"]}
            size="sm"
            variant="outlined"
          />

          <GenericInput
            label="Operated Service"
            placeholder="Enter operated service"
            inputClassName="bg-grayBg"
            labelClassName="mb-2"
            size="full"
            fullWidth
          />
          <GenericInput
            label="Operated Service"
            placeholder="Enter operated service"
            inputClassName="bg-grayBg"
            labelClassName="mb-2"
            size="full"
            fullWidth
          />

          <div>
            <span className="text-blackColor text-sm font-medium leading-[160%] mb-2">
              Time
            </span>

            <RadioGroup
              name="plan"
              orientation="horizontal"
              fullWidth
              wrapperClassName="bg-grayBg border border-borderColor rounded-full h-[48px] px-4 justify-start flex-row items-center"
              options={[
                { value: "day", label: "Day" },
                {
                  value: "hour",
                  label: "Hour",
                },
              ]}
            />
          </div>
        </div>
      </ModalBody>

      <div className="p-5 flex justify-end gap-3 border-t border-gray-100">
        <GenericButton
          variant="outline"
          rounded="full"
          size="lg"
          onClick={closeModal}
          className="w-full"
        >
          Cancel
        </GenericButton>

        <GenericButton variant="primary" rounded="full" size="lg" className="w-full">
          Create service
        </GenericButton>
      </div>
    </ModalWrapper>
  );
};

export default CreateServiceModal;
