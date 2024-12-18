import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';

const Breadcrumb = ({ items, isDarkMode }) => {
  return (
    <div className="text-sm breadcrumbs p-4">
      <ul className={`${isDarkMode ? 'text-white' : 'text-black'}`}>
        <li>
          <Link to="/">Home</Link>
        </li>
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
      link: PropTypes.string
    })
  ).isRequired,
  isDarkMode: PropTypes.bool.isRequired
};

export default Breadcrumb; 