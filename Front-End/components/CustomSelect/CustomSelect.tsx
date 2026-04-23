import React from "react";
import Creatable from "react-select/creatable";

export default function CustomSelect({
  name,
  defaultValue,
  options,
  onChange,
  value,
  placeholder,
  ...rest
}: {
  name?: string;
  defaultValue?: any;
  options?: any;
  onChange?: any;
  value?: any;
  placeholder?: string;
  rest?: any;
}) {
  // const optionsa = [
  //   { value: "chocolate", label: "Chocolate" },
  //   { value: "strawberry", label: "Strawberry" },
  //   { value: "vanilla", label: "Vanilla" },
  // ];

  return (
    <Creatable
      defaultValue={defaultValue}
      value={value}
      placeholder={placeholder}
      closeMenuOnSelect={false}
      isMulti
      onChange={onChange}
      name="colors"
      options={options}
      className="basic-multi-select"
      classNamePrefix="select"
      {...rest}
    />
  );
}
