"use client"
import React, { useEffect, useState } from "react";

type Option = "success" | "danger" | (string & {});

export function Alert({ type, children }: { type?: Option; children?: any }) {
  const [property, setProperty] = useState({
    color: "",
    backgroundColor: "",
    borderColor: "",
  });

  useEffect(() => {
    switch (type) {
      case "success":
        setProperty({
          color: "#3c763d",
          backgroundColor: "#dff0d8",
          borderColor: "#d6e9c6",
        });
        break;
      case "danger":
        setProperty({
          color: "#a94442",
          backgroundColor: "#f2dede",
          borderColor: "#ebccd1",
        });
        break;

      default:
        break;
    }
  }, [type]);

  return (
    <>
      <div
        style={{
          color: `${property.color}`,
          background: `${property.backgroundColor}`,
          borderColor: `${property.borderColor}`,
        }}
        className={`rounded-[4px] border-x-[1px] 
        border-y-[1px] px-[20px] py-[6px] mb-3`}
      >
        {children}
      </div>
    </>
  );
}
