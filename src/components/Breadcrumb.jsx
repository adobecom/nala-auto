import { Link } from "react-router-dom";
import PropTypes from "prop-types";
import { useNavigate } from "react-router-dom";

const Breadcrumb = ({ items, isDarkMode, activeMenu }) => {
  const navigate = useNavigate();

  const handleMenuClick = () => {
    navigate("/"); // Call the parent handler with current menu
  };
  return (
    <div className="text-sm breadcrumbs p-4">
      <ul className={`${isDarkMode ? "text-white" : "text-black"}`}>
        <li>
          <Link to="/">Home</Link>
        </li>
        {activeMenu && (
          <li>
            <button
              onClick={handleMenuClick}
              className="hover:text-primary transition-colors"
            >
              {activeMenu}
            </button>
          </li>
        )}
        {items.map((item, index) => (
          <li key={index}>
            {item.link ? (
              <Link to={item.link}>{item.label}</Link>
            ) : (
              <span>{item.label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

Breadcrumb.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      link: PropTypes.string,
    })
  ).isRequired,
  isDarkMode: PropTypes.bool.isRequired,
  activeMenu: PropTypes.string,
  onMenuClick: PropTypes.func,
};

export default Breadcrumb;
