"use client";

import { CircleHelp } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function Search() {
  const [search, setSearch] = useState<string>("");
  const [product, setProduct] = useState<any>({ results: [] });
  const [filteredProducts, setFilteredProducts] = useState<any[]>([]);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathName = usePathname();

  // Fetch products once when the component mounts
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Demo data
        const demoProducts = {
          data: {
            results: [
              {
                product: {
                  name: "Maid Service Package A",
                  category: { slug: "maid-services" },
                },
              },
              {
                product: {
                  name: "Maid Service Package B",
                  category: { slug: "maid-services" },
                },
              },
              {
                product: {
                  name: "Cleaning Services",
                  category: { slug: "cleaning" },
                },
              },
              {
                product: {
                  name: "Household Management",
                  category: { slug: "household" },
                },
              },
              {
                product: {
                  name: "Care Services",
                  category: { slug: "care-services" },
                },
              },
            ],
          },
        };
        setProduct(demoProducts?.data || { results: [] });
      } catch (error) {
        console.error("Failed to fetch product info:", error);
      }
    };

    fetchData();
  }, []);

  // Filter products when `search` or `product.results` changes
  useEffect(() => {
    if (search.trim() !== "" && product.results.length > 0) {
      setFilteredProducts(
        product?.results?.filter((item: any) =>
          item?.product?.name?.toLowerCase().includes(search.toLowerCase()),
        ) || [],
      );
    } else {
      setFilteredProducts([]);
    }
  }, [search, product.results]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  const handleSearch = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("product", search);

    router.push(`/products?${params.toString()}`);

    // Clear the input field after navigating
    setSearch("");
  };
  const handleProductNameSearch = (path: string, name: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("product", name);
    router.push(`/category/${path}?${params.toString()}`);

    // Clear the input field after navigating
    setSearch("");
  };

  return (
    <div className="w-full md:w-80 lg:w-90 relative">
      <input
        type="text"
        name="search"
        value={search}
        onChange={handleChange}
        className="w-full text-sm  bg-whiteColor border border-gray2Color rounded-md md:rounded-lg py-3 md:py-3.5 px-4 pl-10 focus:outline-none focus:border-dark-500"
        placeholder="Search by Name, Email or Phone Number"
      />
      <button
        onClick={handleSearch}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-2xl"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
        >
          <path
            d="M14.197 13.1363C13.9041 12.8434 13.4292 12.8434 13.1363 13.1363C12.8434 13.4292 12.8434 13.9041 13.1363 14.197L13.6667 13.6667L14.197 13.1363ZM13.6667 13.6667L13.1363 14.197L16.8863 17.947L17.4167 17.4167L17.947 16.8863L14.197 13.1363L13.6667 13.6667ZM15.75 8.25H16.5C16.5 3.69365 12.8063 0 8.25 0V0.75V1.5C11.9779 1.5 15 4.52208 15 8.25H15.75ZM8.25 0.75V0C3.69365 0 0 3.69365 0 8.25H0.75H1.5C1.5 4.52208 4.52208 1.5 8.25 1.5V0.75ZM0.75 8.25H0C0 12.8063 3.69365 16.5 8.25 16.5V15.75V15C4.52208 15 1.5 11.9779 1.5 8.25H0.75ZM8.25 15.75V16.5C12.8063 16.5 16.5 12.8063 16.5 8.25H15.75H15C15 11.9779 11.9779 15 8.25 15V15.75Z"
            fill="#111927"
          />
        </svg>
      </button>

      {/* Display the filtered product list */}
      {search !== "" && (
        <div className="mt-4 bg-white shadow-md rounded-lg px-3 py-6 absolute w-full">
          {filteredProducts.length > 0 ? (
            filteredProducts.map((item: any, index: number) => (
              <button
                key={index}
                onClick={() =>
                  handleProductNameSearch(
                    item.product.category.slug,
                    item.product.name,
                  )
                }
                className="block w-full text-left p-2 text-blackColor text-base font-semibold rounded-md"
              >
                {item.product.name}
              </button>
            ))
          ) : (
            <p className="text-textColor p-2 flex justify-center font-semibold items-center gap-3">
              <CircleHelp className="text-primaryColor" size={40} /> No matching
              products found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
