import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';

// activeMenu is accepted for backwards compatibility but no longer shown:
// the sidebar already indicates where you are.
const Breadcrumb = ({ items, isDarkMode }) => {
  const muted = isDarkMode ? 'text-gray-500' : 'text-gray-400';
  const link = isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900';
  const current = isDarkMode ? 'text-gray-200' : 'text-gray-800';
  return (
    <nav aria-label="Breadcrumb" className="px-6 pt-4 text-sm">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li><Link to="/" className={link}>Home</Link></li>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            <span className={muted} aria-hidden="true">/</span>
            {item.link
              ? <Link to={item.link} className={link}>{item.label}</Link>
              : <span className={`font-medium ${current}`} aria-current="page">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
};

Breadcrumb.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      link: PropTypes.string,
    }),
  ).isRequired,
  isDarkMode: PropTypes.bool.isRequired,
  activeMenu: PropTypes.string,
};

export default Breadcrumb;
